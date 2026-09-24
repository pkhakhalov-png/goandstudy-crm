/**
 * Переводит двух клиентов на куратора Карину — вместе с кураторскими выплатами.
 *
 *   npx tsx scripts/reassign-clients-to-karina.ts            # dry-run
 *   npx tsx scripts/reassign-clients-to-karina.ts --confirm  # применить
 *
 * Почему скриптом, а не из админки: кнопка «Назначить куратора»
 * (assignCurator в app/admin/clients/actions.ts) умеет только ПЕРВОЕ
 * назначение — если curator_id уже стоит, она отказывает («Куратор уже
 * назначен»), и `who` в расходах переписывает только когда оно пустое.
 * Абрамович уже висит на кураторе, так что через UI её не перевести.
 *
 * Выплаты живут в expenses(article='curator', who=<имя куратора>) — отдельной
 * таблицы выплат нет. Переписываем только НЕоплаченные строки: уже выплаченные
 * деньги ушли конкретному человеку, переклеивать на них чужое имя нельзя.
 *
 * current_stage_code не трогаем: у обоих он null, а null в кабинете куратора
 * рисуется как «onboarding» (CuratorDashboard.tsx:60). Придумывать этап,
 * которого клиент не проходил, не за чем.
 */
import { config } from 'dotenv'; import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
const CONFIRM = process.argv.includes('--confirm')
// --no-money: перевести только клиента, выплаты оставить прежнему куратору
// (работа по этапу уже сделана им — деньги за ней не идут).
const NO_MONEY = process.argv.includes('--no-money')

const TARGET_CURATOR = 'Карина'
// --ids 145 — прогнать только часть списка (напр. пока второй клиент на согласовании)
const idsArg = process.argv[process.argv.indexOf('--ids') + 1]
const CLIENT_IDS = process.argv.includes('--ids')
  ? idsArg.split(',').map(Number)
  : [144, 145]

async function main() {
  const { data: karina } = await sb.from('curators')
    .select('id, name').eq('name', TARGET_CURATOR).single()
  if (!karina) { console.error(`Куратор «${TARGET_CURATOR}» не найден`); process.exit(1) }
  console.log(`Цель: ${karina.name} (${karina.id})\n`)

  const { data: curators } = await sb.from('curators').select('id, name')
  const nameById = new Map((curators ?? []).map(c => [c.id, c.name]))
  const now = new Date().toISOString()

  for (const id of CLIENT_IDS) {
    const { data: c } = await sb.from('clients')
      .select('id, name, curator_id, status').eq('id', id).single()
    if (!c) { console.error(`Клиент #${id} не найден`); process.exit(1) }

    const from = c.curator_id ? (nameById.get(c.curator_id) ?? c.curator_id) : '— (не назначен)'
    console.log(`#${c.id} ${c.name}`)
    console.log(`   куратор: ${from} → ${karina.name}`)

    if (c.curator_id === karina.id) {
      console.log('   ↺ уже на Карине — пропускаю')
      continue
    }

    if (CONFIRM) {
      const { error } = await sb.from('clients')
        .update({ curator_id: karina.id, curator_assigned_at: now }).eq('id', c.id)
      if (error) { console.error(`   ✗ clients: ${error.message}`); process.exit(1) }
    }

    if (NO_MONEY) {
      console.log('   ⊘ --no-money: выплаты оставляю прежнему куратору\n')
      continue
    }

    // Кураторские выплаты по этому клиенту
    const { data: exp } = await sb.from('expenses')
      .select('id, who, plan_date, plan_sum, is_paid, status, note')
      .eq('client_id', c.id).eq('article', 'curator').order('plan_date')
    for (const e of exp ?? []) {
      const sum = `${Number(e.plan_sum).toLocaleString('ru-RU')} ₽`
      if (e.is_paid) {
        console.log(`   ⊘ выплата ${e.plan_date} ${sum} уже оплачена (${e.who}) — НЕ трогаю`)
        continue
      }
      console.log(`   → выплата ${e.plan_date} ${sum}: who «${e.who ?? '∅'}» → «${karina.name}» (${e.note ?? ''})`)
      if (CONFIRM) {
        const { error } = await sb.from('expenses')
          .update({ who: karina.name }).eq('id', e.id)
        if (error) { console.error(`     ✗ expenses: ${error.message}`); process.exit(1) }
      }
    }
    console.log('')
  }

  if (!CONFIRM) {
    console.log('⚠️ dry-run. Ничего не записано. Запусти с --confirm.')
    return
  }
  console.log('✓ применено')
}
main().catch(e => { console.error(e); process.exit(1) })
