import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
async function main(){
  const { data } = await sb.from('deals').select('source, custom_fields, created_at').order('created_at',{ascending:false}).limit(400)
  const bySource = new Map<string, number>()
  for (const d of data ?? []) bySource.set(d.source||'—', (bySource.get(d.source||'—')||0)+1)
  console.log('=== deals.source (последние 400) ==='); for (const [k,v] of [...bySource].sort((a,b)=>b[1]-a[1])) console.log(`  ${v}\t${k}`)
  // ищем есть ли utm в custom_fields
  const withUtm = (data??[]).filter(d=> d.custom_fields && JSON.stringify(d.custom_fields).toLowerCase().includes('utm'))
  console.log(`\nСделок с utm в custom_fields: ${withUtm.length}`)
  console.log('\nПример custom_fields последних 3 сделок:')
  for (const d of (data??[]).slice(0,3)) console.log(' ', JSON.stringify(d.custom_fields))
}
main().catch(e=>{console.error(e);process.exit(1)})
