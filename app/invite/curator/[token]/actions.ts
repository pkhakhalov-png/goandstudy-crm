'use server'

import { createAdminClient, createClient as createSsrClient } from '@/lib/supabase/server'
import { lookupCuratorInvitation, sendCuratorWelcomeEmail } from '@/lib/curator-invitation'

export type ActivateResult = { ok: true } | { ok: false; error: string }

export async function activateCuratorAccount(params: {
  token: string
  password: string
}): Promise<ActivateResult> {
  if (!params.token) return { ok: false, error: 'Нет токена' }
  if (!params.password || params.password.length < 8) {
    return { ok: false, error: 'Пароль должен быть от 8 символов' }
  }

  const verdict = await lookupCuratorInvitation(params.token)
  if (!verdict.ok) return { ok: false, error: verdict.error }
  const inv = verdict.invitation

  const admin = await createAdminClient()

  // 1. Проверяем нет ли auth.users с этим email
  const { data: list } = await admin.auth.admin.listUsers()
  const dup = list?.users?.find(u => u.email?.toLowerCase() === inv.email.toLowerCase())
  if (dup) {
    return {
      ok: false,
      error: 'Аккаунт с этим email уже существует. Если забыл пароль — напиши админу.',
    }
  }

  // 2. Создаём auth.users
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: inv.email,
    password: params.password,
    email_confirm: true,
  })
  if (createErr || !created?.user) {
    return { ok: false, error: createErr?.message || 'Не удалось создать аккаунт' }
  }
  const authUserId = created.user.id

  // 3. public.users — role='curator'
  const { data: existingPublic } = await admin
    .from('users').select('id').eq('email', inv.email).maybeSingle()
  if (existingPublic) {
    await admin.from('users').update({ id: authUserId, role: 'curator' }).eq('id', existingPublic.id)
  } else {
    await admin.from('users').insert({ id: authUserId, email: inv.email, role: 'curator' })
  }

  // 4. Привязываем curators.user_id → теперь куратор может видеть своих клиентов
  await admin.from('curators').update({ user_id: authUserId }).eq('id', inv.curator_id)

  // 5. Mark invitation used
  await admin.from('curator_invitations')
    .update({ used_at: new Date().toISOString() })
    .eq('id', inv.id)

  // 6. Логиним
  const ssr = await createSsrClient()
  const { error: signInErr } = await ssr.auth.signInWithPassword({
    email: inv.email,
    password: params.password,
  })
  if (signInErr) {
    return { ok: false, error: `Аккаунт создан, но автологин не удался: ${signInErr.message}. Войди вручную через /login.` }
  }

  // Welcome-письмо куратору
  try {
    const { data: c } = await admin
      .from('curators').select('name').eq('id', inv.curator_id).maybeSingle()
    sendCuratorWelcomeEmail({
      to: inv.email,
      curatorName: c?.name || 'куратор',
      password: params.password,
    }).then(r => {
      if (!r.ok) console.warn('[invite/curator] welcome email failed:', r.error)
    })
  } catch (e) {
    console.warn('[invite/curator] welcome email exception:', e)
  }

  return { ok: true }
}
