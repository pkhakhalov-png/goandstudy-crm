import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const CURATOR_EMAIL = 'curator-test@goandstudy.com'
const CURATOR_PASSWORD = 'Test12345'
const CURATOR_NAME = 'Тест Куратор'

const CLIENT_EMAIL = 'test-client@goandstudy.com'
const CLIENT_PASSWORD = 'Test12345'
const CLIENT_NAME = 'Тестовый Клиент'

async function ensureCurator(): Promise<{ userId: string; curatorId: string }> {
  console.log('\n=== 1. Тест куратор ===')

  const list = await sb.auth.admin.listUsers({ perPage: 1000 })
  let userId = list.data.users.find(u => u.email === CURATOR_EMAIL)?.id

  if (!userId) {
    const { data: created, error } = await sb.auth.admin.createUser({
      email: CURATOR_EMAIL, password: CURATOR_PASSWORD, email_confirm: true,
      user_metadata: { name: CURATOR_NAME },
    })
    if (error || !created.user) throw new Error('createUser: ' + error?.message)
    userId = created.user.id
    console.log(`auth user создан: ${userId}`)
  } else {
    const { error } = await sb.auth.admin.updateUserById(userId, { password: CURATOR_PASSWORD, email_confirm: true })
    if (error) throw new Error('updateUserById: ' + error.message)
    console.log(`auth user уже есть (${userId}) — пароль обновлён`)
  }

  // public.users
  const { error: usersErr } = await sb
    .from('users')
    .upsert({ id: userId, email: CURATOR_EMAIL, name: CURATOR_NAME, role: 'curator', is_active: true }, { onConflict: 'id' })
  if (usersErr) throw new Error('users upsert: ' + usersErr.message)
  console.log('public.users → role=curator ✓')

  // public.curators
  const { data: existing } = await sb.from('curators').select('id').eq('user_id', userId).maybeSingle()
  let curatorId = existing?.id
  if (!curatorId) {
    const { data: newCur, error } = await sb.from('curators')
      .insert({ name: CURATOR_NAME, contact: CURATOR_EMAIL, is_active: true, user_id: userId })
      .select('id').single()
    if (error) throw new Error('curators insert: ' + error.message)
    curatorId = newCur.id
    console.log(`public.curators → создан (${curatorId}) ✓`)
  } else {
    await sb.from('curators').update({ is_active: true, contact: CURATOR_EMAIL }).eq('id', curatorId)
    console.log(`public.curators → ${curatorId} ✓`)
  }

  return { userId, curatorId }
}

async function ensureSalesperson(): Promise<string> {
  const { data: sp } = await sb.from('users').select('id').eq('role', 'salesperson').eq('is_active', true).limit(1).single()
  if (!sp) throw new Error('Нет активных продажников — нужен хотя бы один для clients.salesperson_id NOT NULL')
  return sp.id
}

async function ensureClient(curatorId: string): Promise<{ clientId: number; userId: string }> {
  console.log('\n=== 2. Тест клиент ===')

  // Find existing client by email
  let { data: existing } = await sb.from('clients').select('*').eq('email', CLIENT_EMAIL).maybeSingle()

  let clientId: number
  if (existing) {
    clientId = existing.id
    console.log(`clients #${clientId} уже существует — переподвязываю к куратору`)
    await sb.from('clients').update({
      curator_id: curatorId,
      curator_assigned_at: new Date().toISOString(),
      name: CLIENT_NAME,
      status: 'active',
    }).eq('id', clientId)
  } else {
    const salespersonId = await ensureSalesperson()
    const { data: newClient, error } = await sb.from('clients').insert({
      name: CLIENT_NAME,
      email: CLIENT_EMAIL,
      phone: '+79000000001',
      status: 'active',
      salesperson_id: salespersonId,
      curator_id: curatorId,
      curator_assigned_at: new Date().toISOString(),
      first_payment_date: new Date().toISOString().split('T')[0],
      months: 6,
    }).select('id').single()
    if (error || !newClient) throw new Error('clients insert: ' + error?.message)
    clientId = newClient.id
    console.log(`clients #${clientId} создан, привязан к куратору ${curatorId}`)
  }

  // Auth user
  const list = await sb.auth.admin.listUsers({ perPage: 1000 })
  let userId = list.data.users.find(u => u.email === CLIENT_EMAIL)?.id

  if (!userId) {
    const { data: created, error } = await sb.auth.admin.createUser({
      email: CLIENT_EMAIL, password: CLIENT_PASSWORD, email_confirm: true,
      user_metadata: { name: CLIENT_NAME },
    })
    if (error || !created.user) throw new Error('createUser client: ' + error?.message)
    userId = created.user.id
    console.log(`auth user клиента создан: ${userId}`)
  } else {
    const { error } = await sb.auth.admin.updateUserById(userId, { password: CLIENT_PASSWORD, email_confirm: true })
    if (error) throw new Error('updateUserById client: ' + error.message)
    console.log(`auth клиента уже есть (${userId}) — пароль обновлён`)
  }

  await sb.from('users').upsert(
    { id: userId, email: CLIENT_EMAIL, name: CLIENT_NAME, role: 'client', is_active: true },
    { onConflict: 'id' },
  )
  console.log('public.users → role=client ✓')

  return { clientId, userId }
}

async function main() {
  const { curatorId } = await ensureCurator()
  const { clientId } = await ensureClient(curatorId)

  console.log('\n══════════════════════════════════════════════')
  console.log('✅ ГОТОВО')
  console.log('══════════════════════════════════════════════')
  console.log('\n👤 ТЕСТ КУРАТОР')
  console.log(`   email:    ${CURATOR_EMAIL}`)
  console.log(`   password: ${CURATOR_PASSWORD}`)
  console.log(`   curator_id: ${curatorId}`)
  console.log(`   login:    https://crm.goandstudy.com/login`)
  console.log(`   кабинет:  https://crm.goandstudy.com/curator`)

  console.log('\n🎓 ТЕСТ КЛИЕНТ')
  console.log(`   email:    ${CLIENT_EMAIL}`)
  console.log(`   password: ${CLIENT_PASSWORD}`)
  console.log(`   client_id: #${clientId}`)
  console.log(`   привязан к куратору: ${curatorId}`)
  console.log(`   login:    https://crm.goandstudy.com/login`)
  console.log(`   кабинет:  https://crm.goandstudy.com/client`)
}

main().catch(e => { console.error('\n❌ Ошибка:', e.message || e); process.exit(1) })
