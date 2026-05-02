import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

async function main() {
  const { data } = await sb.from('users').select('id, email, role, name').eq('role', 'salesperson')
  console.log('salespersons:')
  for (const u of data || []) {
    console.log(' ', u.id, '|', u.email, '|', u.name)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
