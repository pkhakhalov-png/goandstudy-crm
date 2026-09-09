import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const seo = sb.schema('seo')
async function main(){
  // 1) резолв to_page_id по всем внутренним ссылкам батчами (postgREST не даёт join-update, делаем в TS)
  const { data: pages } = await seo.from('pages').select('id, normalized_url')
  const idByUrl = new Map((pages??[]).map((p:any)=>[p.normalized_url, p.id]))
  const { data: unres } = await seo.from('link_edges').select('id, to_url').is('to_page_id', null).eq('link_type','internal')
  let fixed=0; const updates:{id:number,to_page_id:number}[]=[]
  for (const e of unres ?? []){ const id = idByUrl.get(e.to_url); if (id){ updates.push({id:e.id,to_page_id:id}); } }
  // применяем по одному (немного, ок)
  for (let i=0;i<updates.length;i++){ const u=updates[i]; const {error}=await seo.from('link_edges').update({to_page_id:u.to_page_id}).eq('id',u.id); if(!error) fixed++ }
  console.log('резолв внутренних ссылок: проставлено to_page_id =', fixed, 'из', unres?.length)

  // 2) битые: внутренние ссылки, чья цель НЕ в pages (после резолва так и null)
  const { count: stillNull } = await seo.from('link_edges').select('id',{count:'exact',head:true}).is('to_page_id',null).eq('link_type','internal')
  console.log('внутренних ссылок на НЕизвестные URL (вне инвентаря):', stillNull)

  // 3) честные сироты
  const { data: P } = await seo.from('pages').select('id, normalized_url, indexable, page_type')
  const { data: inc } = await seo.from('link_edges').select('to_page_id').eq('block','content').not('to_page_id','is',null)
  const withInc = new Set((inc??[]).map((e:any)=>e.to_page_id))
  const orphans = (P??[]).filter((p:any)=>p.indexable && !withInc.has(p.id))
  console.log('\nЧЕСТНЫЕ orphan (индекс., без входящих content-ссылок):', orphans.length)
  const byType:Record<string,number>={}; for(const o of orphans) byType[o.page_type]=(byType[o.page_type]||0)+1
  console.log('  по типу:', JSON.stringify(byType))
  for (const o of orphans.slice(0,15)) console.log('   -', o.normalized_url.replace('https://goandstudy.com',''))
}
main().catch(e=>{console.error(e);process.exit(1)})
