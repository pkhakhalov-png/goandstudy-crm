/**
 * Активирует кабинет куратора напрямую — создаёт auth user с известным паролем,
 * привязывает к curators.user_id, гасит активную invite-ссылку.
 *
 * usage: npx tsx scripts/activate-curator.ts "<Имя>" "<Пароль>"
 */

import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.goandstudy.com'

async function main() {
  const name = process.argv[2]
  const password = process.argv[3]
  if (!name || !password) {
    console.error('usage: npx tsx scripts/activate-curator.ts "<Имя>" "<Пароль>"')
    process.exit(1)
  }

  const { data: curator } = await sb.from('curators')
    .select('id, name, email, contact, user_id').eq('name', name).maybeSingle()
  if (!curator) { console.error(`куратор «${name}» не найден`); process.exit(1) }

  const email = curator.email || curator.contact
  if (!email) { console.error('у куратора нет email — заполни сначала'); process.exit(1) }

  let userId = curator.user_id

  // Создаём auth user или сбрасываем пароль существующему
  if (!userId) {
    // может уже есть auth-пользователь с этим email — найдём
    const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 })
    const existingAuth = list?.users.find(u => u.email === email)
    if (existingAuth) {
      userId = existingAuth.id
      const { error } = await sb.auth.admin.updateUserById(userId, { password, email_confirm: true })
      if (error) { console.error('updateUser:', error.message); process.exit(1) }
      console.log(`auth user уже был (${userId}) — пароль обновлён`)
    } else {
      const { data: created, error } = await sb.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { name },
      })
      if (error || !created.user) { console.error('createUser:', error?.message); process.exit(1) }
      userId = created.user.id
      console.log(`auth user создан (${userId})`)
    }
  } else {
    const { error } = await sb.auth.admin.updateUserById(userId, { password, email, email_confirm: true })
    if (error) { console.error('updateUser:', error.message); process.exit(1) }
    console.log(`пароль сброшен для существующего user_id ${userId}`)
  }

  // public.users
  await sb.from('users').upsert({
    id: userId, email, name, role: 'curator', is_active: true,
  }, { onConflict: 'id' })

  // curators — привязка
  if (!curator.user_id) {
    await sb.from('curators').update({ user_id: userId, email }).eq('id', curator.id)
    console.log('curators.user_id привязан')
  }

  // гасим активные invitations
  const { data: invites } = await sb.from('curator_invitations')
    .select('id, token').eq('curator_id', curator.id).is('used_at', null)
  if (invites && invites.length > 0) {
    await sb.from('curator_invitations')
      .update({ used_at: new Date().toISOString() })
      .eq('curator_id', curator.id).is('used_at', null)
    console.log(`погашено invitations: ${invites.length}`)
  }

  console.log('\n✅ Готово.')
  console.log(`   Email:    ${email}`)
  console.log(`   Пароль:   ${password}`)
  console.log(`   Вход:     ${APP_URL}/login`)
}

main().catch(e => { console.error(e); process.exit(1) })
