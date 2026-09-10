import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
async function main() {
  const { data, error } = await sb.from('curator_stages').select('*').limit(50)
  if (error) console.log('curator_stages error:', error.message)
  console.log('rows:', data?.length)
  for (const s of data ?? []) console.log(JSON.stringify(s))
}
main().catch(e=>{console.error(e);process.exit(1)})
