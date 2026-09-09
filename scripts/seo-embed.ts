import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth:{persistSession:false}}).schema('seo')
async function main(){
  if(process.argv[2]==='start'){ const {error}=await seo.from('jobs').insert({step:'embed_pages',lane:'production',priority:60,payload:{}}); console.log(error?'err '+error.message:'✓ embed_pages поставлена') }
  const {count:total}=await seo.from('pages').select('id',{count:'exact',head:true})
  const {count:withEmb}=await seo.from('pages').select('id',{count:'exact',head:true}).not('embedding','is',null)
  console.log(`эмбеддинги: ${withEmb}/${total} страниц`)
}
main().catch(e=>{console.error(e);process.exit(1)})
