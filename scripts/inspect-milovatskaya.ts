import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
async function main(){
  const { data: c } = await sb.from('clients').select('*').ilike('name','%миловатск%')
  for (const cl of c ?? []) {
    console.log(`client id=${cl.id} | ${cl.name} | months=${cl.months} | status=${cl.status} | first_payment_date=${cl.first_payment_date}`)
    const { data: pays } = await sb.from('payments').select('*').eq('client_id', cl.id).order('num')
    console.log('  payments columns:', pays?.[0] ? Object.keys(pays[0]).join(', ') : '—')
    for (const p of pays ?? []) console.log(`   #${p.num} id=${p.id} | plan_sum=${p.plan_sum} plan_date=${p.plan_date} | is_paid=${p.is_paid} fact_sum=${p.fact_sum} fact_date=${p.fact_date} | status=${p.status}`)
    const { data: exps } = await sb.from('expenses').select('id, article, who, plan_sum, is_paid, note').eq('client_id', cl.id)
    console.log('  expenses:'); for (const e of exps ?? []) console.log(`   ${e.article} | ${e.who} | ${e.plan_sum} | paid=${e.is_paid} | ${e.note}`)
  }
}
main().catch(e=>{console.error(e);process.exit(1)})
