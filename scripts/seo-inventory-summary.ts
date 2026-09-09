import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const seo = sb.schema('seo')
async function main(){
  const { data: pages } = await seo.from('pages').select('id, normalized_url, platform, page_type, http_status, indexable, canonical_url, word_count')
  const P = pages ?? []
  const by = (f:(p:any)=>string)=>{ const m:Record<string,number>={}; for(const p of P) m[f(p)]=(m[f(p)]||0)+1; return m }
  console.log('ВСЕГО страниц:', P.length)
  console.log('по типу:', JSON.stringify(by(p=>p.page_type)))
  console.log('по платформе:', JSON.stringify(by(p=>p.platform)))
  console.log('индексируемых:', P.filter(p=>p.indexable).length, '| НЕиндекс.:', P.filter(p=>!p.indexable).length)
  console.log('HTTP не 200:', P.filter(p=>p.http_status!==200).map(p=>`${p.http_status} ${p.normalized_url}`).slice(0,10))
  console.log('без canonical:', P.filter(p=>!p.canonical_url).length)
  console.log('пустых/мало слов (<100):', P.filter(p=>(p.word_count||0)<100).length)
  // ссылки
  const { count: edges } = await seo.from('link_edges').select('id',{count:'exact',head:true})
  const { count: broken } = await seo.from('link_edges').select('id',{count:'exact',head:true}).eq('link_type','broken')
  console.log('link_edges всего:', edges, '| broken:', broken)
  // orphan-кандидаты: индексируемые страницы без входящих content-ссылок
  const { data: incoming } = await seo.from('link_edges').select('to_page_id').eq('block','content').not('to_page_id','is',null)
  const withIncoming = new Set((incoming??[]).map((e:any)=>e.to_page_id))
  const orphans = P.filter(p=>p.indexable && !withIncoming.has(p.id))
  console.log('orphan-кандидаты (индекс., без входящих content-ссылок):', orphans.length)
  for (const o of orphans.slice(0,12)) console.log('   -', o.normalized_url.replace('https://goandstudy.com',''))
  // вернуть краул в норму
  await seo.from('settings').update({ value:{"production":3,"crawl":3,"gsc":1,"freshness":2,"index":1,"attribution":1,"autopilot":1} }).eq('key','worker_concurrency_by_lane')
  console.log('\ncrawl concurrency возвращён в 3')
}
main().catch(e=>{console.error(e);process.exit(1)})
