import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

// Ася=89, Ирина=127 (экспертная сессия), плюс сравним с обычным (Кудинов=126)
const IDS = [89, 127, 126]

async function main() {
  const { data: clients } = await db.from('clients').select('*').in('id', IDS)

  for (const cid of IDS) {
    const c = (clients || []).find(x => x.id === cid)
    console.log(`\n===== client_id=${cid}  ${c?.name}  (${c?.country}) =====`)
    console.log(`  status=${c?.status}  months=${c?.months}  first_payment_date=${c?.first_payment_date}  current_stage_code=${c?.current_stage_code}`)
    console.log(`  university=${c?.university}  notes=${JSON.stringify(c?.notes)}`)
    console.log(`  project_data=${JSON.stringify(c?.project_data)}`)

    const { data: pays } = await db.from('payments').select('num, plan_date, plan_sum, fact_sum, is_paid').eq('client_id', cid).order('num')
    const total = (pays || []).reduce((s, p) => s + Number(p.plan_sum || 0), 0)
    console.log(`  ПЛАТЕЖИ КЛИЕНТА (${pays?.length}) totalПлан=${total}₽:`)
    for (const p of pays || []) console.log(`    #${p.num} ${p.plan_date} план=${p.plan_sum}₽ факт=${p.fact_sum} paid=${p.is_paid}`)

    const { data: exps } = await db.from('expenses').select('article, who, plan_sum, note').eq('client_id', cid).order('article')
    console.log(`  РАСХОДЫ (${exps?.length}):`)
    for (const e of exps || []) console.log(`    ${e.article} who=${e.who ?? 'NULL'} ${e.plan_sum}₽ "${e.note}"`)
  }
}
main()
