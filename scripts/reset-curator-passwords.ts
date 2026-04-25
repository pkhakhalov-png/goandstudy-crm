import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const envFile = process.argv[2] === '--dev' ? '.env.development.local' : '.env.local'
config({ path: path.resolve(process.cwd(), envFile) })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(`Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${envFile}`)
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const TARGETS = [
  { email: 'curator-test@goandstudy.com', password: 'Test12345' },
  { email: 'curator-test2@goandstudy.com', password: 'Test12345' },
]

async function main() {
  console.log(`Supabase: ${SUPABASE_URL}`)
  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) {
    console.error('listUsers error:', listErr.message)
    process.exit(1)
  }

  for (const t of TARGETS) {
    const u = listData.users.find(x => x.email === t.email)
    if (!u) {
      console.log(`- ${t.email}: NOT FOUND`)
      continue
    }
    const { error } = await supabase.auth.admin.updateUserById(u.id, { password: t.password })
    if (error) {
      console.error(`- ${t.email}: FAIL — ${error.message}`)
    } else {
      console.log(`- ${t.email}: password reset ✓`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
