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
  console.log('env:', process.env.NEXT_PUBLIC_SUPABASE_URL)

  const { data: clientsTable } = await sb.from('clients').select('id,name,email,curator_id').order('id')
  console.log('\nclients table (id/name/email/curator_id):')
  clientsTable?.forEach((c: any) => console.log(' ', c.id, '|', c.name, '|', c.email, '| curator=', c.curator_id))

  const { data: usersClients } = await sb.from('users').select('id,email,role').eq('role', 'client')
  console.log('\nusers with role=client:')
  usersClients?.forEach((u: any) => console.log(' ', u.email, u.id))

  const { data: authUsers } = await sb.auth.admin.listUsers({ perPage: 500 })
  const possibleEmails = ['ivanov-client@goandstudy.com', 'client-test@goandstudy.com', 'test-client@goandstudy.com']
  console.log('\nauth check (possible client logins):')
  for (const e of possibleEmails) {
    const u = authUsers.users.find(x => x.email === e)
    console.log(' ', e, '→', u ? `exists (${u.id})` : 'NOT FOUND')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
