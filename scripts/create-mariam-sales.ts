import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const EMAIL = 'mariamavv@yandex.ru'
const NAME = 'Мариам'
const PASSWORD = 'Mariam2026!'
async function main() {
  const { data: exist } = await sb.from('users').select('id').eq('email', EMAIL).maybeSingle()
  if (exist) { console.log('⚠ Пользователь с таким email уже есть, id=', exist.id); return }

  const { data: authData, error: authErr } = await sb.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { name: NAME },
  })
  if (authErr || !authData?.user) { console.error('auth error:', authErr?.message); process.exit(1) }
  const uid = authData.user.id

  const { error: uErr } = await sb.from('users').upsert(
    { id: uid, email: EMAIL, name: NAME, role: 'salesperson', is_active: true, round_robin_count: 0 },
    { onConflict: 'id' }
  )
  if (uErr) { console.error('users error:', uErr.message); process.exit(1) }

  console.log('✅ Продажник создан')
  console.log('   user_id:', uid)
  console.log('   Имя в CRM:', NAME, '(Авакян Мариам Арутюновна)')
  console.log('   Логин:', EMAIL)
  console.log('   Пароль:', PASSWORD)
}
main().catch(e => { console.error(e); process.exit(1) })
