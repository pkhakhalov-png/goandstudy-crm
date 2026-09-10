import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const { error } = await sb.from('clients').update({ status: 'completed' }).eq('id', 47)
  if (error) { console.error('ERR:', error.message); process.exit(1) }
  const { data } = await sb.from('clients').select('id, name, status').eq('id', 47).maybeSingle()
  console.log('OK:', data)
}
main().catch(e => { console.error(e); process.exit(1) })
