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
  const { data, error } = await sb.rpc('exec_sql' as any, {
    sql: "SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid WHERE t.relname = 'users' AND c.conname = 'users_role_check'",
  } as any)
  console.log('rpc:', data, error)

  const { data: existing } = await sb.from('users').select('role').limit(50)
  const roles = new Set(existing?.map(r => r.role))
  console.log('existing roles in users table:', [...roles])
}
main().catch(e => { console.error(e); process.exit(1) })
