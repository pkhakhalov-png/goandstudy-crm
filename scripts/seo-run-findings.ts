import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth:{persistSession:false} }).schema('seo')
async function main(){
  const a=process.argv[2]||'status'
  if(a==='start'){ const {error}=await seo.from('jobs').insert({step:'findings_inventory',lane:'findings',priority:40,payload:{}}); console.log(error?'err '+error.message:'✓ findings_inventory поставлена') }
  const {data}=await seo.from('findings').select('kind').eq('status','open')
  const m:Record<string,number>={}; for(const f of data||[]) m[f.kind]=(m[f.kind]||0)+1
  console.log('findings open:', JSON.stringify(m), '| всего', (data||[]).length)
}
main().catch(e=>{console.error(e);process.exit(1)})
