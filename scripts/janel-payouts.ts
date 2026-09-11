// Выплаты куратору Жанель по списку от 11.09.2026.
//
// «С нуля» — оба этапа её, сейчас выплачивается первый (25 000).
// «Продолжение» — первый этап ушёл прежнему куратору, её второй этап делится
// пополам: 12 500 выплачиваем, 12 500 остаётся долгом.
//
// Сухой прогон по умолчанию. Запись: --apply
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const TODAY = '2026-09-11'
const JANEL = 'Жанель'

const SCRATCH = [36, 109, 117, 99]      // с нуля: отметить первый этап на 25 000
const CONTINUE = [43, 56]                // продолжение: разбить второй этап пополам
const REASSIGN = [36, 43]                // сменить куратора на Жанель

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: janel } = await sb.from('curators').select('id').eq('name', JANEL).single()
  let paidNow = 0, owed = 0

  console.log(APPLY ? '=== ЗАПИСЬ ===\n' : '=== СУХОЙ ПРОГОН, ничего не меняется ===\n')

  for (const id of [...SCRATCH, ...CONTINUE]) {
    const { data: c } = await sb.from('clients').select('id, name, curator_id').eq('id', id).single()
    const { data: ex } = await sb.from('expenses')
      .select('id, plan_sum, is_paid, who, plan_date, note').eq('client_id', id).eq('article', 'curator')
      .order('plan_date', { nullsFirst: false })
    if (!c || !ex) { console.log(`#${id}: не найден`); continue }

    const kind = SCRATCH.includes(id) ? 'с нуля' : 'продолжение'
    console.log(`#${id} ${c.name.trim()} — ${kind}`)

    if (REASSIGN.includes(id)) {
      console.log(`   куратор → ${JANEL}`)
      if (APPLY) await sb.from('clients').update({ curator_id: janel!.id }).eq('id', id)
    }

    if (kind === 'с нуля') {
      // Оба этапа её работа, поэтому получатель у обоих — Жанель
      for (const e of ex) {
        if (e.who !== JANEL) {
          console.log(`   получатель этапа ${e.plan_sum} → ${JANEL} (было «${e.who}»)`)
          if (APPLY) await sb.from('expenses').update({ who: JANEL }).eq('id', e.id)
        }
      }
      const first = ex.find((e: any) => !e.is_paid)
      if (!first) { console.log('   все этапы уже выплачены — пропуск'); continue }
      console.log(`   этап 1: 25 000 → отмечаю выплаченным ${TODAY}`)
      if (APPLY) {
        await sb.from('expenses').update({
          is_paid: true, fact_sum: 25000, fact_date: TODAY, who: JANEL, status: 'paid',
        }).eq('id', first.id)
      }
      paidNow += 25000
      const rest = ex.filter((e: any) => e.id !== first.id && !e.is_paid)
      for (const r of rest) { console.log(`   этап 2: ${r.plan_sum} остаётся в плане`); owed += Number(r.plan_sum) }
      continue
    }

    // Продолжение: её этап — тот, что не выплачен
    const hers = ex.find((e: any) => !e.is_paid)
    if (!hers) { console.log('   невыплаченных этапов нет — пропуск'); continue }

    console.log(`   этап ${hers.plan_sum} (получатель «${hers.who}») делю пополам:`)
    console.log(`      12 500 → выплачено ${TODAY}`)
    console.log(`      12 500 → остаётся долгом`)
    if (APPLY) {
      await sb.from('expenses').update({
        plan_sum: 12500, fact_sum: 12500, fact_date: TODAY, is_paid: true, status: 'paid',
        who: JANEL, note: `${hers.note ?? 'Куратор — этап 2'} · половина 1 из 2`,
      }).eq('id', hers.id)
      await sb.from('expenses').insert({
        client_id: id, article: 'curator', who: JANEL,
        plan_sum: 12500, plan_date: hers.plan_date, is_paid: false, status: 'planned',
        note: `${hers.note ?? 'Куратор — этап 2'} · половина 2 из 2, остаток к выплате`,
      })
    }
    paidNow += 12500
    owed += 12500
  }

  console.log(`\nвыплачено сейчас: ${paidNow.toLocaleString('ru')} ₽`)
  console.log(`остаётся к выплате по этим клиентам: ${owed.toLocaleString('ru')} ₽`)
  if (!APPLY) console.log('\nэто сухой прогон. Запись: --apply')
}
main().catch((e) => { console.error('✗', e.message); process.exit(1) })
