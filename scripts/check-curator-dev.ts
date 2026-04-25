import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.development.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

async function main() {
  console.log('env:', process.env.NEXT_PUBLIC_SUPABASE_URL)
  const { data: users } = await sb.from('users').select('id,email,role').in('role', ['curator', 'admin'])
  console.log('\ncurator/admin users:')
  users?.forEach(u => console.log(' ', u.email, '→', u.role, u.id))

  const { data: curators } = await sb.from('curators').select('id,name,contact,user_id,is_active')
  console.log('\ncurators table:')
  curators?.forEach((c: any) => console.log(' ', c.id, '|', c.name, '| contact=', c.contact, '| user_id=', c.user_id))

  const { data: clients } = await sb.from('clients').select('id,name,curator_id,current_stage_code').limit(30)
  console.log('\nclients:')
  clients?.forEach(c => console.log(' ', c.id, c.name, '→ curator_id=', c.curator_id, 'stage=', c.current_stage_code))

  const { data: authUsers } = await sb.auth.admin.listUsers({ perPage: 500 })
  const curatorEmails = ['curator-test@goandstudy.com', 'curator-test2@goandstudy.com']
  console.log('\nauth lookup:')
  for (const e of curatorEmails) {
    const u = authUsers.users.find(x => x.email === e)
    console.log(' ', e, '→', u ? `exists (id=${u.id})` : 'NOT FOUND')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
