import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const USER_ID = '89e935cd-f565-4c40-a6e7-c786f0629a03'
const NEW_PASSWORD = 'TestSales2026!'

async function main() {
  const { data, error } = await sb.auth.admin.updateUserById(USER_ID, {
    password: NEW_PASSWORD,
  })
  if (error) throw error
  console.log('password reset for', data.user?.email)
  console.log('login:', data.user?.email)
  console.log('password:', NEW_PASSWORD)
}
main().catch(e => { console.error(e); process.exit(1) })
