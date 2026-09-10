import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
async function main() {
  const { data: st } = await sb.from('curator_stages').select('code, title, sort_order').order('sort_order')
  console.log('=== curator_stages ===')
  for (const s of st ?? []) console.log(`  ${s.sort_order}\t${s.code}\t${s.title}`)
}
main().catch(e=>{console.error(e);process.exit(1)})
