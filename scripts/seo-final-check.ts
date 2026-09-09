import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth:{persistSession:false}}).schema('seo')
async function main(){
  const {count:pages}=await seo.from('pages').select('id',{count:'exact',head:true})
  const {count:emb}=await seo.from('pages').select('id',{count:'exact',head:true}).not('embedding','is',null)
  const {count:edges}=await seo.from('link_edges').select('id',{count:'exact',head:true})
  const {data:f}=await seo.from('findings').select('kind').eq('status','open')
  const m:Record<string,number>={}; for(const x of f||[])m[x.kind]=(m[x.kind]||0)+1
  console.log(`pages=${pages} | эмбеддинги=${emb}/${pages} | link_edges=${edges}`)
  console.log('findings:', JSON.stringify(m), '| всего', (f||[]).length)
}
main().catch(e=>{console.error(e);process.exit(1)})
