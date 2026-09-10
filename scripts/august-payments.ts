import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
async function main() {
  const { data: users } = await sb.from('users').select('id, name')
  const umap = new Map((users ?? []).map(u => [u.id, u.name]))
  const { data: clients } = await sb.from('clients').select('id, name, salesperson_id, status, created_at')
  const cmap = new Map((clients ?? []).map(c => [c.id, c]))
  // оплаченные платежи с датой факта в августе
  const { data: pays } = await sb.from('payments')
    .select('client_id, plan_sum, fact_sum, fact_date, is_paid, num')
    .eq('is_paid', true).gte('fact_date', '2026-08-01').lt('fact_date', '2026-09-01')
  const byClient = new Map<number, { sum: number; count: number; firstNum: boolean }>()
  for (const p of pays ?? []) {
    const g = byClient.get(p.client_id) || { sum: 0, count: 0, firstNum: false }
    g.sum += Number(p.fact_sum || p.plan_sum || 0); g.count++
    if (p.num === 1) g.firstNum = true
    byClient.set(p.client_id, g)
  }
  const rows = [...byClient.entries()].map(([id, g]) => ({ c: cmap.get(id), ...g }))
    .sort((a, b) => b.sum - a.sum)
  const total = rows.reduce((s, r) => s + r.sum, 0)
  console.log(`Оплат проведено в августе: ${pays?.length ?? 0} шт на ${total.toLocaleString('ru')} ₽`)
  console.log(`Клиентов с оплатами в августе: ${rows.length}`)
  console.log(`Из них НОВЫЕ (заведены в августе, первый платёж): считаю ниже\n`)
  console.log('=== КЛИЕНТЫ С ОПЛАТАМИ В АВГУСТЕ ===')
  rows.forEach((r, i) => {
    const created = r.c ? new Date(r.c.created_at) : null
    const isNewAug = created && created >= new Date('2026-08-01') && created < new Date('2026-09-01')
    console.log(`${String(i+1).padStart(2)}. ${r.c?.name ?? '?'}  —  ${r.sum.toLocaleString('ru')} ₽ (${r.count} плат.) | продажник: ${r.c?.salesperson_id ? (umap.get(r.c.salesperson_id)||'?') : '—'} | ${isNewAug ? 'НОВЫЙ в авг' : 'ранее'}${r.firstNum ? ' | 1-й платёж' : ''}${r.c?.status==='archived'?' | архив':''}`)
  })
  const newAug = rows.filter(r => { const d = r.c && new Date(r.c.created_at); return d && d >= new Date('2026-08-01') && d < new Date('2026-09-01') })
  console.log(`\nИТОГО новых клиентов августа с оплатой: ${newAug.length}`)
}
main().catch(e=>{console.error(e);process.exit(1)})
