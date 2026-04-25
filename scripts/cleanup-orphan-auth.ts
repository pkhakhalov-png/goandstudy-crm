import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const ORPHAN_USER_ID = '6a9f1834-ac4d-400c-900d-e9e36d30acaa'

async function main() {
  const { error } = await sb.auth.admin.deleteUser(ORPHAN_USER_ID)
  if (error) console.error('delete error:', error.message)
  else console.log(`deleted orphan auth user ${ORPHAN_USER_ID}`)
}
main().catch(e => { console.error(e); process.exit(1) })
