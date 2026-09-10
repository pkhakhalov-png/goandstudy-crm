/**
 * Обратимый архив клиентов: снапшот → удалить НЕОПЛАЧЕННЫЕ платежи/расходы → status='archived'.
 * Оплаченные (проведённые) остаются в истории.
 *   npx tsx scripts/archive-clients.ts            # dry-run
 *   npx tsx scripts/archive-clients.ts --confirm  # выполнить
 * Требует применённой миграции 20260828000000_client_archive.sql
 */
import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const CONFIRM = process.argv.includes('--confirm')

const TARGETS: { id: number; reason: string }[] = [
  { id: 37,  reason: 'Сабрина Сидики — закончили работу' },
  { id: 47,  reason: 'Камалова Каролина — отвалилась' },
  { id: 94,  reason: 'Анастасия Видру — отвалилась' },
  { id: 107, reason: 'Владимир Соколов — отвалился' },
  { id: 116, reason: 'Михаил Лихтар — отвалился' },
  { id: 51,  reason: 'Безус Юлия — архив' },
  { id: 52,  reason: 'Безус Юлия — архив' },
  { id: 102, reason: 'Михаил Нессонов (Yulia Nessonova) — передумал поступать' },
]
const num = (v: any) => Number(v || 0)

async function main() {
  console.log(CONFIRM ? '=== АРХИВАЦИЯ (--confirm) ===\n' : '=== DRY-RUN ===\n')
  let delPay = 0, delExp = 0, keptIn = 0, keptOut = 0, rmIn = 0, rmOut = 0
  for (const t of TARGETS) {
    const { data: c } = await sb.from('clients').select('*').eq('id', t.id).maybeSingle()
    if (!c) { console.log(`❌ id=${t.id} не найден`); continue }
    const { data: pays } = await sb.from('payments').select('*').eq('client_id', t.id)
    const { data: exps } = await sb.from('expenses').select('*').eq('client_id', t.id)
    const unpaidPays = (pays ?? []).filter(p => !p.is_paid)
    const unpaidExps = (exps ?? []).filter(e => !e.is_paid)
    const uIn = unpaidPays.reduce((s, p) => s + num(p.plan_sum), 0)
    const uOut = unpaidExps.reduce((s, e) => s + num(e.plan_sum), 0)
    const pIn = (pays ?? []).filter(p => p.is_paid).reduce((s, p) => s + num(p.fact_sum || p.plan_sum), 0)
    const pOut = (exps ?? []).filter(e => e.is_paid).reduce((s, e) => s + num(e.fact_sum || e.plan_sum), 0)
    rmIn += uIn; rmOut += uOut; keptIn += pIn; keptOut += pOut
    console.log(`• id=${t.id} ${c.name} [${c.status}] — убрать: ${unpaidPays.length} платежей (${uIn.toLocaleString('ru')}) + ${unpaidExps.length} расходов (${uOut.toLocaleString('ru')}); оставить проведённое: +${pIn.toLocaleString('ru')} / -${pOut.toLocaleString('ru')}`)

    if (CONFIRM) {
      // 1) снапшот (полный) для отката
      const { error: eSnap } = await sb.from('client_archive').upsert({
        client_id: t.id, reason: t.reason, original_status: c.status,
        client_json: c, payments_json: pays ?? [], expenses_json: exps ?? [],
      }, { onConflict: 'client_id' })
      if (eSnap) { console.error(`  снапшот err: ${eSnap.message}`); process.exit(1) }
      // 2) удалить неоплаченные
      if (unpaidPays.length) { const { error } = await sb.from('payments').delete().eq('client_id', t.id).eq('is_paid', false); if (error) { console.error('  del pay err:', error.message); process.exit(1) } delPay += unpaidPays.length }
      if (unpaidExps.length) { const { error } = await sb.from('expenses').delete().eq('client_id', t.id).eq('is_paid', false); if (error) { console.error('  del exp err:', error.message); process.exit(1) } delExp += unpaidExps.length }
      // 3) статус
      const { error: eSt } = await sb.from('clients').update({ status: 'archived' }).eq('id', t.id)
      if (eSt) { console.error(`  status err: ${eSt.message}`); process.exit(1) }
    }
  }
  console.log(`\nУбираем из будущих цифр: приход −${rmIn.toLocaleString('ru')}, расход (кураторам) −${rmOut.toLocaleString('ru')}`)
  console.log(`Остаётся в истории: получено ${keptIn.toLocaleString('ru')}, выплачено ${keptOut.toLocaleString('ru')}`)
  if (CONFIRM) console.log(`\n✅ Заархивировано. Удалено неоплаченных: ${delPay} платежей, ${delExp} расходов. Снапшоты в client_archive (restore вернёт всё).`)
  else console.log('\n⚠️ dry-run. Сначала применить миграцию, затем запустить с --confirm.')
}
main().catch(e => { console.error(e); process.exit(1) })
