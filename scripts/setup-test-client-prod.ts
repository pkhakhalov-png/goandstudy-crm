import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const CLIENT_ID = 50
const EMAIL = 'test-client@goandstudy.com'
const PASSWORD = 'Test12345'
const NAME = 'Тестовый Клиент — Подборка'

async function main() {
  console.log('env:', process.env.NEXT_PUBLIC_SUPABASE_URL)

  const { data: client } = await sb.from('clients').select('*').eq('id', CLIENT_ID).single()
  if (!client) {
    console.error(`client #${CLIENT_ID} not found`)
    process.exit(1)
  }
  console.log(`client #${client.id}: ${client.name} | curator_id=${client.curator_id} | email=${client.email}`)

  let userId: string

  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const existing = list.users.find(u => u.email === EMAIL)

  if (existing) {
    userId = existing.id
    console.log(`auth user already exists (${userId}) — resetting password`)
    const { error } = await sb.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true })
    if (error) { console.error('updateUserById:', error.message); process.exit(1) }
  } else {
    const { data: created, error } = await sb.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: NAME },
    })
    if (error || !created.user) { console.error('createUser:', error?.message); process.exit(1) }
    userId = created.user.id
    console.log(`auth user created: ${userId}`)
  }

  const { error: usersErr } = await sb
    .from('users')
    .upsert({ id: userId, email: EMAIL, name: NAME, role: 'client', is_active: true }, { onConflict: 'id' })
  if (usersErr) { console.error('users upsert:', usersErr.message); process.exit(1) }
  console.log('public.users → role=client ✓')

  const { error: clientErr } = await sb.from('clients').update({ email: EMAIL }).eq('id', CLIENT_ID)
  if (clientErr) { console.error('clients update:', clientErr.message); process.exit(1) }
  console.log(`clients.email → ${EMAIL} ✓`)

  console.log('\n✅ Done!')
  console.log(`   email:    ${EMAIL}`)
  console.log(`   password: ${PASSWORD}`)
  console.log(`   role:     client (linked to client #${CLIENT_ID})`)
  console.log(`\n   Login at https://crm.goandstudy.com/login`)
}

main().catch(e => { console.error(e); process.exit(1) })
