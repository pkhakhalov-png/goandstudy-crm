import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
async function forWho(who: string){
  const { data: exps } = await sb.from('expenses').select('client_id, plan_sum, is_paid, note').eq('article','curator').eq('who', who)
  const ids = [...new Set((exps??[]).map(e=>e.client_id))]
  const { data: cl } = ids.length ? await sb.from('clients').select('id,name,status,curator_id').in('id', ids) : { data: [] as any[] }
  const cmap = new Map((cl??[]).map(c=>[c.id,c]))
  let paid=0, unpaid=0
  console.log(`\n===== who='${who}' =====`)
  const byClient = new Map<number, any[]>()
  for (const e of exps??[]){ if(!byClient.has(e.client_id)) byClient.set(e.client_id,[]); byClient.get(e.client_id)!.push(e) }
  for (const [cid, es] of byClient){
    const c = cmap.get(cid)
    const parts = es.map(e=>`${(e.note||'').replace('Куратор — ','').replace('Kurator ','')||'?'}:${Number(e.plan_sum).toLocaleString('ru')}${e.is_paid?'✓ОПЛ':'✗долг'}`)
    for(const e of es){ if(e.is_paid) paid+=Number(e.plan_sum); else unpaid+=Number(e.plan_sum) }
    console.log(`  #${cid} ${c?.name??'?'} [${c?.status??'?'}] — ${parts.join(' | ')}`)
  }
  console.log(`  ИТОГО ${who}: оплачено ${paid.toLocaleString('ru')} | долг ${unpaid.toLocaleString('ru')}`)
}
async function main(){ await forWho('Софья'); await forWho('Жанель') }
main().catch(e=>{console.error(e);process.exit(1)})
