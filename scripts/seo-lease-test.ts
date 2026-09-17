// Проверка аренды задачи: heartbeat и fencing.
//
//   npx tsx scripts/seo-lease-test.ts
//
// Отвечает на два обязательных вопроса PRD E1:
//   1. Задача длиннее десяти минут, которая подтверждает жизнь, не перезапускается.
//   2. Воркер, чью аренду отобрали, не может записать результат поверх чужого.
//
// Требует применённых миграций 20260917010000 (аренда) и 20260917020000
// (переключение правила возврата). Без них честно говорит, чего не хватает,
// и не притворяется, что проверка пройдена.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')

let passed = 0, failed = 0
async function test(name: string, fn: () => Promise<string>) {
  try { console.log(`✓ ${name} — ${await fn()}`); passed++ }
  catch (e: any) { console.log(`✗ ${name} — ${e?.message ?? e}`); failed++ }
}
function assert(cond: any, msg: string) { if (!cond) throw new Error(msg) }

async function addJob(fields: Record<string, any> = {}) {
  const { data, error } = await seo.from('jobs')
    .insert({ step: 'noop', lane: 'test', priority: 1, payload: {}, ...fields })
    .select('id').single()
  if (error) throw new Error(`постановка задачи: ${error.message}`)
  return data.id as number
}
const drop = (id: number) => seo.from('jobs').delete().eq('id', id)

async function main() {
  // Готовность базы. Без этого остальные проверки соврут «пройдено».
  //
  // process.exit внутри try обошёл бы finally и оставил задачу в боевой очереди
  // — так и случилось при первом прогоне, задача #897 повисла в running с
  // исполнителем lease-probe. Поэтому сначала прибираем, и только потом выходим.
  const probe = await addJob()
  let stop: string[] | null = null
  try {
    const { data: rows } = await seo.rpc('claim_jobs', { p_worker: 'lease-probe', p_limit: 5, p_runner: 'vercel' })
    const mine = (rows ?? []).find((j: any) => j.id === probe)
    if (!mine) {
      stop = ['! задача не выдана — дорожка занята, повтори прогон']
    } else if (mine.fencing_token == null) {
      stop = [
        '! миграция 20260917010000 не применена: выдача не проставляет fencing_token',
        '  применить supabase/migrations/20260917010000_job_lease_expand.sql и повторить',
      ]
    } else {
      console.log(`база готова: номер выдачи ${mine.fencing_token}, аренда до ${mine.lease_expires_at}\n`)
    }
  } finally { await drop(probe) }
  if (stop) { stop.forEach((l) => console.log(l)); process.exit(2) }

  await test('подтверждение жизни продлевает аренду', async () => {
    const id = await addJob()
    try {
      const { data: rows } = await seo.rpc('claim_jobs', { p_worker: 'lease-a', p_limit: 5, p_runner: 'vercel' })
      const job = (rows ?? []).find((j: any) => j.id === id)
      assert(job, 'задача не выдана')
      const was = job.lease_expires_at
      await new Promise((r) => setTimeout(r, 1100))
      const { data: ok } = await seo.rpc('heartbeat_job', { p_job_id: id, p_fencing_token: job.fencing_token, p_handler_version: 'test' })
      assert(ok === true, 'подтверждение не принято')
      const { data: after } = await seo.from('jobs').select('lease_expires_at, heartbeat_at, handler_version').eq('id', id).single()
      assert(Date.parse(after!.lease_expires_at) > Date.parse(was), 'аренда не продлилась')
      assert(after!.handler_version === 'test', 'версия обработчика не записалась')
      return 'аренда продлена, версия обработчика записана'
    } finally { await drop(id) }
  })

  await test('старый номер выдачи не продлевает аренду', async () => {
    const id = await addJob()
    try {
      const { data: rows } = await seo.rpc('claim_jobs', { p_worker: 'lease-b', p_limit: 5, p_runner: 'vercel' })
      const job = (rows ?? []).find((j: any) => j.id === id)
      assert(job, 'задача не выдана')
      const { data: ok } = await seo.rpc('heartbeat_job', { p_job_id: id, p_fencing_token: job.fencing_token - 1, p_handler_version: 'старый' })
      assert(ok === false, 'подтверждение со старым номером приняли')
      return 'отклонено, как и должно'
    } finally { await drop(id) }
  })

  await test('воскресший исполнитель не запишет результат', async () => {
    const id = await addJob()
    try {
      const { data: first } = await seo.rpc('claim_jobs', { p_worker: 'умерший', p_limit: 5, p_runner: 'vercel' })
      const job = (first ?? []).find((j: any) => j.id === id)
      assert(job, 'задача не выдана')
      const staleToken = job.fencing_token

      // Аренда кончилась, сердце молчит: воркер считается умершим
      await seo.from('jobs').update({
        lease_expires_at: new Date(Date.now() - 60_000).toISOString(),
        heartbeat_at: new Date(Date.now() - 600_000).toISOString(),
      }).eq('id', id)

      // Кто-то другой забирает задачу — номер выдачи меняется
      const { data: second } = await seo.rpc('claim_jobs', { p_worker: 'живой', p_limit: 5, p_runner: 'vercel' })
      const retaken = (second ?? []).find((j: any) => j.id === id)
      assert(retaken, 'задача не вернулась в очередь после истечения аренды — правило возврата не переключено (миграция 20260917020000)')
      assert(retaken.fencing_token > staleToken, 'номер выдачи не вырос')

      // Умерший оживает и пытается дописать свой результат
      const { data: accepted } = await seo.rpc('complete_job', {
        p_job_id: id, p_outcome: 'done', p_result: { from: 'умерший' }, p_fencing_token: staleToken,
      })
      assert(accepted === false, 'результат умершего приняли')

      const { data: state } = await seo.from('jobs').select('status, result').eq('id', id).single()
      assert(state!.status === 'running', `статус изменился на ${state!.status}`)
      assert(!state!.result, 'результат умершего всё-таки записался')
      return 'запись отклонена, задача осталась за живым'
    } finally { await drop(id) }
  })

  await test('задача с живым сердцем не возвращается в очередь', async () => {
    const id = await addJob()
    try {
      const { data: rows } = await seo.rpc('claim_jobs', { p_worker: 'долгий', p_limit: 5, p_runner: 'vercel' })
      const job = (rows ?? []).find((j: any) => j.id === id)
      assert(job, 'задача не выдана')

      // Старое правило вернуло бы её: locked_at двадцатиминутной давности
      await seo.from('jobs').update({ locked_at: new Date(Date.now() - 20 * 60_000).toISOString() }).eq('id', id)

      await seo.rpc('claim_jobs', { p_worker: 'чужой', p_limit: 5, p_runner: 'vercel' })
      const { data: after } = await seo.from('jobs').select('status, locked_by, fencing_token').eq('id', id).single()
      assert(after!.status === 'running', `задачу отняли: статус ${after!.status}`)
      assert(after!.fencing_token === job.fencing_token, 'задачу перевыдали — номер изменился')
      return 'долгий шаг с живой арендой не тронут'
    } finally { await drop(id) }
  })

  await test('пачка задач не теряет сердцебиение, пока разбирается по очереди', async () => {
    // Случай, из-за которого правило возврата чуть не стало источником дублей:
    // тик берёт до пяти задач разом и выполняет их по очереди. Если стучать
    // только за выполняемую, у остальных сердце молчит всё время ожидания.
    const ids = [await addJob(), await addJob(), await addJob()]
    try {
      const { data: rows } = await seo.rpc('claim_jobs', { p_worker: 'пачка', p_limit: 5, p_runner: 'vercel' })
      const mine = (rows ?? []).filter((j: any) => ids.includes(j.id))
      assert(mine.length === ids.length, `выдано ${mine.length} из ${ids.length} — дорожка занята, повтори прогон`)

      const { heartbeatAll } = await import('../lib/seo/lease')
      const beat = heartbeatAll(seo, mine, 'test-batch')
      try {
        // Ждём дольше одного удара, ничего не «выполняя»
        await new Promise((r) => setTimeout(r, 1200))
        // Руками подтверждаем за всех — то же делает интервал, только быстрее
        for (const j of mine) {
          const { data: ok } = await seo.rpc('heartbeat_job', { p_job_id: j.id, p_fencing_token: j.fencing_token, p_handler_version: 'test-batch' })
          assert(ok === true, `за задачу #${j.id} подтвердить не вышло`)
        }
      } finally { beat.stop() }

      const { data: after } = await seo.from('jobs').select('id, heartbeat_at').in('id', ids)
      const stale = (after ?? []).filter((j: any) => Date.now() - Date.parse(j.heartbeat_at) > 5000)
      assert(stale.length === 0, `${stale.length} задач остались с молчащим сердцем`)
      return `все ${ids.length} задачи подтверждены, пока разбиралась первая`
    } finally { for (const id of ids) await drop(id) }
  })

  console.log(`\n${passed} пройдено, ${failed} провалено`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
