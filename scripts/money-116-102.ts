import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
async function money(id: number) {
  const { data: c } = await sb.from('clients').select('id,name,status,curator_id').eq('id', id).single()
  const { data: pays } = await sb.from('payments').select('plan_sum, fact_sum, is_paid').eq('client_id', id)
  const { data: exps } = await sb.from('expenses').select('plan_sum, fact_sum, is_paid').eq('client_id', id)
  const paidIn = (pays??[]).filter(p=>p.is_paid).reduce((s,p)=>s+Number(p.fact_sum||p.plan_sum||0),0)
  const unpaidIn = (pays??[]).filter(p=>!p.is_paid).reduce((s,p)=>s+Number(p.plan_sum||0),0)
  const paidOut = (exps??[]).filter(e=>e.is_paid).reduce((s,e)=>s+Number(e.fact_sum||e.plan_sum||0),0)
  const unpaidOut = (exps??[]).filter(e=>!e.is_paid).reduce((s,e)=>s+Number(e.plan_sum||0),0)
  console.log(`id=${id} | ${c?.name} | ${c?.status}`)
  console.log(`   приход: получено ${paidIn.toLocaleString('ru')} | должны нам ${unpaidIn.toLocaleString('ru')} [${pays?.length||0}]`)
  console.log(`   расход: выплачено ${paidOut.toLocaleString('ru')} | мы должны ${unpaidOut.toLocaleString('ru')} [${exps?.length||0}]`)
}
async function main(){ await money(116); await money(102) }
main().catch(e=>{console.error(e);process.exit(1)})
