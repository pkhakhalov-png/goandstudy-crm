import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const seo = sb.schema('seo')
async function main(){
  const action = process.argv[2] || 'status'
  if (action === 'start'){
    // ускорить краул на время инвентаря
    await seo.from('settings').update({ value: {"production":3,"crawl":8,"gsc":1,"freshness":2,"index":1,"attribution":1,"autopilot":1} }).eq('key','worker_concurrency_by_lane')
    // не плодить дубли
    const { data: ex } = await seo.from('jobs').select('id').in('step',['inventory_sitemap','crawl_page']).in('status',['pending','running','waiting']).limit(1)
    if (ex?.length){ console.log('уже идёт'); return }
    const { error } = await seo.from('jobs').insert({ step:'inventory_sitemap', lane:'crawl', priority:50, payload:{ sitemap_url:'https://goandstudy.com/sitemap.xml' } })
    console.log(error ? 'insert err: '+error.message : '✓ inventory_sitemap поставлена, crawl=8')
  }
  // статус
  const { data: jobs } = await seo.from('jobs').select('step,status').in('step',['inventory_sitemap','crawl_page'])
  const agg: Record<string,Record<string,number>> = {}
  for (const j of jobs ?? []){ (agg[j.step] ??= {})[j.status] = ((agg[j.step]||{})[j.status]||0)+1 }
  console.log('jobs:', JSON.stringify(agg))
  const { count } = await seo.from('pages').select('id',{count:'exact',head:true})
  console.log('pages в инвентаре:', count)
}
main().catch(e=>{console.error(e);process.exit(1)})
