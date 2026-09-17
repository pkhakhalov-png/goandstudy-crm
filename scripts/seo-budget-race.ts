// Параллельные резервы не дают превысить лимит.
//
//   npx tsx scripts/seo-budget-race.ts
//
// Четвёртый обязательный тест PRD E1: «Параллельные резервы бюджета не дают
// превысить лимит». Проверяется именно одновременность: последовательные
// резервы правильно считает и наивная реализация, а разойтись они могут только
// тогда, когда два исполнителя читают остаток в один и тот же момент.
//
// Тест работает с настоящими лимитами и за собой прибирает: свои резервы
// помечает по reason и удаляет в finally.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')
const MARK = 'проверка гонки резервов'

let passed = 0, failed = 0
async function test(name: string, fn: () => Promise<string>) {
  try { console.log(`✓ ${name} — ${await fn()}`); passed++ }
  catch (e: any) { console.log(`✗ ${name} — ${e?.message ?? e}`); failed++ }
}
/**
 * `asserts c` в сигнатуре — не украшение: без него TypeScript не сужает тип
 * после проверки, и дальше по коду приходится ставить восклицательные знаки,
 * то есть глушить ровно ту проверку, ради которой assert и написан.
 */
function assert(c: any, m: string): asserts c { if (!c) throw new Error(m) }

async function setLimit(key: string, v: number) {
  await seo.from('settings').upsert({ key, value: v }, { onConflict: 'key' }).throwOnError()
}
async function getLimit(key: string): Promise<number> {
  const { data } = await seo.from('settings').select('value').eq('key', key).single()
  return Number(data?.value)
}
async function cleanup() {
  await seo.from('budget_reservations').delete().like('reason', `%${MARK}%`)
}

async function main() {
  const dayWas = await getLimit('budget_daily_usd')
  const monWas = await getLimit('budget_monthly_usd')
  console.log(`лимиты до теста: сутки $${dayWas}, месяц $${monWas}\n`)

  try {
    await test('одновременные резервы не перешагивают суточный лимит', async () => {
      await cleanup()
      // Свой маленький лимит поверх текущего расхода: так тест не зависит от
      // того, сколько уже потрачено сегодня.
      const { data: left } = await seo.rpc('budget_left')
      const usedDay = Number((left ?? []).find((r: any) => r.scope.startsWith('day'))?.used_usd ?? 0)
      const room = 10
      await setLimit('budget_daily_usd', usedDay + room)

      // Двадцать одновременных попыток по доллару при запасе в десять.
      // Пройти должны ровно десять, остальные получить отказ.
      const tries = 20
      const results = await Promise.all(
        Array.from({ length: tries }, () =>
          seo.rpc('reserve_budget', { p_amount: 1, p_job_id: null, p_role: 'writer', p_reason: MARK }),
        ),
      )
      const granted = results.filter((r: any) => r.data != null).length
      const denied = results.filter((r: any) => r.data == null && !r.error).length
      const errored = results.filter((r: any) => r.error).length

      assert(errored === 0, `${errored} вызовов упали с ошибкой: ${results.find((r: any) => r.error)?.error?.message}`)
      assert(granted <= room, `выдано ${granted} резервов при запасе ${room} — лимит перешагнули`)
      assert(granted === room, `выдано ${granted} из ${room} — лимит недоиспользован, значит блокировка слишком груба`)

      const { data: after } = await seo.rpc('budget_left')
      const usedNow = Number((after ?? []).find((r: any) => r.scope.startsWith('day'))?.used_usd ?? 0)
      assert(usedNow <= usedDay + room, `занято ${usedNow} при лимите ${usedDay + room}`)

      return `выдано ${granted}, отказано ${denied}, лимит не превышен`
    })

    await test('месячный лимит держится отдельно от суточного', async () => {
      await cleanup()
      const { data: left } = await seo.rpc('budget_left')
      const usedMon = Number((left ?? []).find((r: any) => r.scope.startsWith('month'))?.used_usd ?? 0)
      // Суточный ставим широким, месячный узким: отказ должен прийти от месячного.
      await setLimit('budget_daily_usd', 1000)
      await setLimit('budget_monthly_usd', usedMon + 3)

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          seo.rpc('reserve_budget', { p_amount: 1, p_job_id: null, p_role: 'writer', p_reason: MARK }),
        ),
      )
      const granted = results.filter((r: any) => r.data != null).length
      assert(granted === 3, `выдано ${granted}, а месячного запаса было на 3`)
      return 'месячный запас исчерпался раньше суточного, как и должен'
    })

    await test('неизвестный исход не освобождает резерв', async () => {
      await cleanup()
      await setLimit('budget_daily_usd', 1000)
      await setLimit('budget_monthly_usd', 1000)

      const { data: resId } = await seo.rpc('reserve_budget', { p_amount: 1, p_job_id: null, p_role: 'writer', p_reason: MARK })
      assert(resId != null, 'резерв не взялся')

      const { data: run, error: runErr } = await seo.from('runs').insert({
        role: 'writer', provider: 'anthropic', model: 'claude-opus-5',
        status: 'unknown', error: 'связь оборвалась после отправки',
      }).select('id').single()
      assert(!runErr && run, `вызов не записался: ${runErr?.message}`)
      await seo.from('budget_reservations').update({ run_id: run.id }).eq('id', resId)

      const { data: released } = await seo.rpc('release_reservation', { p_reservation_id: resId, p_reason: 'попытка освободить' })
      assert(released === false, 'резерв под неизвестный исход отпустили — деньги ушли бы дважды')

      const { data: state } = await seo.from('budget_reservations').select('state').eq('id', resId).single()
      assert(state!.state === 'held', `состояние стало ${state!.state}, а должно остаться held`)

      await seo.from('runs').delete().eq('id', run.id)
      return 'резерв остался держаться до сверки, как требует PRD'
    })

  } finally {
    await cleanup()
    await setLimit('budget_daily_usd', dayWas)
    await setLimit('budget_monthly_usd', monWas)
    const d = await getLimit('budget_daily_usd'); const m = await getLimit('budget_monthly_usd')
    console.log(`\nлимиты возвращены: сутки $${d}, месяц $${m}`)
  }

  console.log(`${passed} пройдено, ${failed} провалено`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
