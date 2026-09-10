import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const ID = 135
async function dump(t: string){
  const { data } = await sb.from('payments').select('num, plan_sum, plan_date, is_paid, fact_date, fact_sum').eq('client_id', ID).order('num')
  console.log(`--- ${t} ---`)
  for (const p of data ?? []) console.log(`  #${p.num} | ${Number(p.plan_sum).toLocaleString('ru')} | план ${p.plan_date} | ${p.is_paid?`ОПЛАЧЕН ${p.fact_date}`:'не оплачен'}`)
}
async function main(){
  await dump('ДО')
  // существующий платёж #1 (id=313) → первый взнос, оплачен
  const { data: p1 } = await sb.from('payments').select('id').eq('client_id', ID).eq('num', 1).single()
  const u = await sb.from('payments').update({ plan_sum: 96666.67, is_paid: true, fact_date: '2026-08-26', fact_sum: 96666.67 }).eq('id', p1!.id)
  if (u.error){ console.error('upd #1:', u.error.message); process.exit(1) }
  // добавить #2 и #3 (если ещё нет)
  const { data: has } = await sb.from('payments').select('num').eq('client_id', ID)
  const nums = new Set((has ?? []).map(x=>x.num))
  const ins: any[] = []
  if (!nums.has(2)) ins.push({ client_id: ID, num: 2, plan_sum: 96666.67, plan_date: '2026-09-26', is_paid: false })
  if (!nums.has(3)) ins.push({ client_id: ID, num: 3, plan_sum: 96666.66, plan_date: '2026-10-26', is_paid: false })
  if (ins.length){ const r = await sb.from('payments').insert(ins); if (r.error){ console.error('insert:', r.error.message); process.exit(1) } }
  // months 1 → 3
  const m = await sb.from('clients').update({ months: 3 }).eq('id', ID)
  if (m.error){ console.error('months:', m.error.message); process.exit(1) }
  await dump('ПОСЛЕ')
  const { data: sum } = await sb.from('payments').select('plan_sum').eq('client_id', ID)
  console.log(`\nСумма по 3 платежам: ${(sum ?? []).reduce((s,p)=>s+Number(p.plan_sum),0).toLocaleString('ru')} ₽ (должно 290 000)`)
}
main().catch(e=>{console.error(e);process.exit(1)})
