/**
 * Создаёт чистого тестового клиента с готовым auth-аккаунтом.
 * Для E2E тестирования клиентского кабинета без прохождения invite-флоу.
 */

import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const EMAIL = 'test-client@goandstudy.com'
const PASSWORD = 'TestClient2026!'
const NAME = 'Тестовый Клиент'
const TEST_SP_ID = '89e935cd-f565-4c40-a6e7-c786f0629a03'
const TEST_CURATOR_ID = '5b4ad7c2-dcd0-4d94-b025-a29d3698c3a8'

async function main() {
  // 1. Удаляем если был
  const { data: list } = await sb.auth.admin.listUsers()
  const existing = list?.users?.find(u => u.email?.toLowerCase() === EMAIL.toLowerCase())
  if (existing) {
    await sb.from('users').delete().eq('id', existing.id)
    await sb.auth.admin.deleteUser(existing.id)
  }
  await sb.from('clients').delete().eq('email', EMAIL)

  // 2. Создаём auth user
  const { data: authData, error: authErr } = await sb.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  })
  if (authErr) throw authErr
  const userId = authData.user!.id

  // 3. public.users
  await sb.from('users').insert({ id: userId, email: EMAIL, role: 'client' })

  // 4. clients row
  const { data: client, error } = await sb.from('clients').insert({
    name: NAME,
    email: EMAIL,
    phone: '+79999999999',
    salesperson_id: TEST_SP_ID,
    curator_id: TEST_CURATOR_ID,
    status: 'active',
    onboarded: true, // чтобы не показывался спотлайт-тур (если хочешь — поставь false)
  }).select('id').single()
  if (error) throw error

  console.log('---')
  console.log('email:', EMAIL)
  console.log('password:', PASSWORD)
  console.log('client_id:', client.id)
  console.log('linked sp:', TEST_SP_ID, '(test@goandstudy.com)')
  console.log('linked curator:', TEST_CURATOR_ID, '(curator-test@goandstudy.com)')
  console.log('login url:', 'https://crm.goandstudy.com/login')
}
main().catch(e => { console.error(e); process.exit(1) })
