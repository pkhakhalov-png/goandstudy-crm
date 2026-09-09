import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const seo = sb.schema('seo')
async function all(table:string, cols:string, filter?:(q:any)=>any){
  const out:any[]=[]; let from=0; const size=1000
  while(true){ let q=seo.from(table).select(cols).range(from,from+size-1); if(filter)q=filter(q); const {data,error}=await q; if(error)throw error; out.push(...(data||[])); if(!data||data.length<size)break; from+=size }
  return out
}
async function main(){
  const P = await all('pages','id, normalized_url, indexable, page_type')
  const urlSet = new Set(P.map(p=>p.normalized_url))
  // все внутренние content-ссылки
  const edges = await all('link_edges','to_url, block, link_type', q=>q.eq('link_type','internal').eq('block','content'))
  const linkedContent = new Set(edges.map(e=>e.to_url))
  const orphans = P.filter(p=>p.indexable && !linkedContent.has(p.normalized_url))
  const byType:Record<string,number>={}; for(const o of orphans) byType[o.page_type]=(byType[o.page_type]||0)+1
  console.log('Страниц:', P.length, '| content-internal ссылок:', edges.length)
  console.log('ЧЕСТНЫЕ orphan:', orphans.length, '| по типу:', JSON.stringify(byType))
  for(const o of orphans.slice(0,20)) console.log('   -', o.normalized_url.replace('https://goandstudy.com',''))
  // внутренние ссылки на URL вне инвентаря (кандидаты в «нет страницы»/битые)
  const allInternal = await all('link_edges','to_url', q=>q.eq('link_type','internal'))
  const missingTargets = [...new Set(allInternal.map(e=>e.to_url).filter(u=>!urlSet.has(u)))]
  console.log('\nВнутренних ссылок на URL ВНЕ инвентаря (уник. целей):', missingTargets.length)
  for(const u of missingTargets.slice(0,15)) console.log('   ?', u.replace('https://goandstudy.com',''))
}
main().catch(e=>{console.error(e);process.exit(1)})
