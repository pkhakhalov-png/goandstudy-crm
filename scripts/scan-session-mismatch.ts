import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const { data: clients } = await db.from('clients').select('id, name, country, months')
  const { data: pays } = await db.from('payments').select('client_id, plan_sum, fact_sum, is_paid')
  const { data: exps } = await db.from('expenses').select('client_id, article, plan_sum').eq('article', 'curator')

  const payTotal = (cid: number) => (pays || []).filter(p => p.client_id === cid).reduce((s, p) => s + Number(p.plan_sum || 0), 0)
  const payFact  = (cid: number) => (pays || []).filter(p => p.client_id === cid).reduce((s, p) => s + Number(p.fact_sum || 0), 0)
  const curRows  = (cid: number) => (exps || []).filter(e => e.client_id === cid)
  const curTotal = (cid: number) => curRows(cid).reduce((s, e) => s + Number(e.plan_sum || 0), 0)

  console.log('=== ПОДОЗРИТЕЛЬНЫЕ: похоже на экспертную сессию (малая оплата), но куратору 25000×2 ===\n')
  const suspects: any[] = []
  for (const c of clients || []) {
    const rows = curRows(c.id)
    const has2x25 = rows.length >= 2 && rows.filter(r => Number(r.plan_sum) === 25000).length >= 2
    const plan = payTotal(c.id)
    const fact = payFact(c.id)
    // экспертная сессия: оплата (план или факт) <= 20000, но куратор >= 50000
    const smallPay = plan > 0 && plan <= 20000
    if (has2x25 && smallPay) {
      suspects.push(c)
      console.log(`  #${c.id} ${c.name} (${c.country}) | months=${c.months} | оплата план=${plan}₽ факт=${fact}₽ | куратор=${curTotal(c.id)}₽ (${rows.length} строк)`)
    }
  }
  if (suspects.length === 0) console.log('  (не найдено)')

  console.log('\n=== Для контекста: ВСЕ клиенты с оплатой <= 20000 (проверь глазами) ===\n')
  for (const c of clients || []) {
    const plan = payTotal(c.id)
    if (plan > 0 && plan <= 20000) {
      const rows = curRows(c.id)
      console.log(`  #${c.id} ${c.name} | оплата=${plan}₽ | куратор=${curTotal(c.id)}₽ (${rows.length} стр., суммы: ${rows.map(r=>r.plan_sum).join('+')})`)
    }
  }
}
main()
