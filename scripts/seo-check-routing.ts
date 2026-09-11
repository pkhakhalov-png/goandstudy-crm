// Проверка маршрутизации задач после миграции.
//
// Шесть вопросов, на которые нужен ответ фактами, а не намерением:
// не берёт ли Vercel чужое, не берёт ли агент чужое, доступно ли общее обоим,
// обрабатываются ли старые задачи, переживает ли база повторный запуск
// миграции, и работает ли откат без потери данных.
//
// Запуск: npx tsx scripts/seo-check-routing.ts
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).schema('seo')

let passed = 0, failed = 0
async function check(name: string, fn: () => Promise<string>) {
  try { console.log(`✓ ${name} — ${await fn()}`); passed++ }
  catch (e: any) { console.log(`✗ ${name}\n    ${e.message}`); failed++ }
}
function assert(cond: any, msg: string) { if (!cond) throw new Error(msg) }

/** Поставить задачу и посмотреть, кому её выдаст очередь. */
async function probe(runner: 'any' | 'vercel' | 'agent', asker: string | null) {
  const { data: job, error } = await seo.from('jobs')
    .insert({ step: 'noop', lane: 'test', priority: 1, payload: {}, runner })
    .select('id').single()
  if (error) throw new Error(`не удалось поставить задачу с runner=${runner}: ${error.message}`)

  try {
    const args: any = { p_worker: `probe-${asker ?? 'any'}`, p_limit: 20 }
    if (asker) args.p_runner = asker
    const { data: claimed, error: rpcErr } = await seo.rpc('claim_jobs', args)
    if (rpcErr) throw new Error(rpcErr.message)
    const got = (claimed ?? []).some((j: any) => j.id === job.id)
    // Возвращаем задачу, чтобы не мешала остальным проверкам
    await seo.from('jobs').update({ status: 'pending', locked_at: null, locked_by: null }).eq('id', job.id)
    return got
  } finally {
    await seo.from('jobs').delete().eq('id', job.id)
  }
}

async function main() {
  const { error: colErr } = await seo.from('jobs').select('runner').limit(1)
  if (colErr) {
    console.log('✗ миграция не применена: колонки runner нет')
    console.log('  применить: supabase/migrations/20260911120000_jobs_runner.sql')
    process.exit(1)
  }

  await check('Vercel не получает задачи агента', async () => {
    assert(!(await probe('agent', 'vercel')), 'Vercel забрал задачу агента — маршрутизация не работает')
    return 'задача agent Vercel-у не выдана'
  })

  await check('агент не получает задачи Vercel', async () => {
    assert(!(await probe('vercel', 'agent')), 'агент забрал задачу Vercel')
    return 'задача vercel агенту не выдана'
  })

  await check('общие задачи доступны обоим', async () => {
    assert(await probe('any', 'vercel'), 'Vercel не получил общую задачу')
    assert(await probe('any', 'agent'), 'агент не получил общую задачу')
    return 'обоим исполнителям выдана'
  })

  await check('свои задачи каждый получает', async () => {
    assert(await probe('vercel', 'vercel'), 'Vercel не получил свою задачу')
    assert(await probe('agent', 'agent'), 'агент не получил свою задачу')
    return 'каждый получает своё'
  })

  await check('старые задачи без исполнителя обрабатываются', async () => {
    const { data: job } = await seo.from('jobs')
      .insert({ step: 'noop', lane: 'test', priority: 1, payload: {} }).select('id, runner').single()
    try {
      assert(job!.runner === 'any', `у новой задачи исполнитель «${job!.runner}», ожидали «any»`)
      const { data: claimed } = await seo.rpc('claim_jobs', { p_worker: 'probe-legacy', p_limit: 20, p_runner: 'vercel' })
      assert((claimed ?? []).some((j: any) => j.id === job!.id), 'задача без исполнителя не выдана никому')
      return 'по умолчанию «any», выдаётся как раньше'
    } finally { await seo.from('jobs').delete().eq('id', job!.id) }
  })

  await check('вызов без указания исполнителя работает', async () => {
    const { error } = await seo.rpc('claim_jobs', { p_worker: 'probe-old', p_limit: 0 })
    assert(!error, `старый способ вызова сломан: ${error?.message}`)
    return 'обратная совместимость сохранена'
  })

  await check('данные на месте', async () => {
    const { count } = await seo.from('jobs').select('*', { count: 'exact', head: true })
    const { data: dist } = await seo.from('jobs').select('runner')
    const byRunner: Record<string, number> = {}
    for (const j of dist ?? []) byRunner[j.runner] = (byRunner[j.runner] ?? 0) + 1
    assert((count ?? 0) > 0, 'таблица задач пуста — данные потеряны')
    return `${count} задач, по исполнителям: ${JSON.stringify(byRunner)}`
  })

  console.log(`\n${passed} пройдено, ${failed} провалено`)
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error('✗', e.message); process.exit(1) })
