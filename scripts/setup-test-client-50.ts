/**
 * Создаёт auth-аккаунт для тестового клиента #50.
 * Используется для тестирования client-флоу без прохождения invite-цепочки.
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

const CLIENT_ID = 50
const PASSWORD = 'TestClient50!'

async function main() {
  const { data: client } = await sb.from('clients').select('id, name, email').eq('id', CLIENT_ID).single()
  if (!client?.email) throw new Error('client has no email')

  // Проверим есть ли уже auth-юзер
  const { data: list } = await sb.auth.admin.listUsers()
  const existing = list?.users?.find(u => u.email?.toLowerCase() === client.email.toLowerCase())

  let authUserId: string
  if (existing) {
    console.log('auth user exists, resetting password')
    const { data, error } = await sb.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
    })
    if (error) throw error
    authUserId = data.user!.id
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email: client.email,
      password: PASSWORD,
      email_confirm: true,
    })
    if (error) throw error
    authUserId = data.user!.id
    console.log('created new auth user')
  }

  // public.users
  const { data: existingPublic } = await sb.from('users').select('id, role').eq('email', client.email).maybeSingle()
  if (existingPublic) {
    if (existingPublic.id !== authUserId || existingPublic.role !== 'client') {
      await sb.from('users').update({ id: authUserId, role: 'client' }).eq('email', client.email)
    }
  } else {
    await sb.from('users').insert({ id: authUserId, email: client.email, role: 'client' })
  }

  // mark invitation used (если есть active)
  await sb.from('client_invitations').update({ used_at: new Date().toISOString() })
    .eq('client_id', CLIENT_ID).is('used_at', null)

  console.log('---')
  console.log('email:', client.email)
  console.log('password:', PASSWORD)
  console.log('client_id:', CLIENT_ID)
  console.log('login url:', 'https://crm.goandstudy.com/login')
}
main().catch(e => { console.error(e); process.exit(1) })
