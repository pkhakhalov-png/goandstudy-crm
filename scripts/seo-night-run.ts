import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth:{persistSession:false}}).schema('seo')
async function main(){
  if(process.argv[2]==='start'){
    await seo.from('jobs').insert([{step:'findings_inventory',lane:'findings',priority:40,payload:{}},{step:'check_missing_links',lane:'crawl',priority:45,payload:{}}])
    console.log('✓ findings_inventory + check_missing_links поставлены')
  }
  const {data}=await seo.from('findings').select('kind,confidence').eq('status','open')
  const m:Record<string,number>={}; for(const f of data||[]) m[`${f.kind}/${f.confidence}`]=(m[`${f.kind}/${f.confidence}`]||0)+1
  console.log('findings:', JSON.stringify(m), '| всего', (data||[]).length)
}
main().catch(e=>{console.error(e);process.exit(1)})
