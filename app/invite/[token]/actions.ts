'use server'

import { createAdminClient, createClient as createSsrClient } from '@/lib/supabase/server'
import { lookupInvitation } from '@/lib/invitation'

export type ActivateResult = { ok: true } | { ok: false; error: string }

export async function activateClientAccount(params: {
  token: string
  password: string
}): Promise<ActivateResult> {
  if (!params.token) return { ok: false, error: 'Нет токена' }
  if (!params.password || params.password.length < 8) {
    return { ok: false, error: 'Пароль должен быть от 8 символов' }
  }

  const verdict = await lookupInvitation(params.token)
  if (!verdict.ok) return { ok: false, error: verdict.error }
  const inv = verdict.invitation

  const admin = await createAdminClient()

  // 1. Проверяем не зарегистрирован ли уже auth.users с этим email.
  // Если да — возможно клиент пытается зарегистрироваться повторно (или email
  // совпал с другим юзером). Лучше отказать с понятной ошибкой.
  const { data: existingAuth } = await admin.auth.admin.listUsers()
  const dup = existingAuth?.users?.find(u => u.email?.toLowerCase() === inv.email.toLowerCase())
  if (dup) {
    return {
      ok: false,
      error: 'Аккаунт с этим email уже существует. Если забыл пароль — напиши куратору.',
    }
  }

  // 2. Создаём auth.users + email confirmed (мы доверяем что email верный,
  //    т.к. продажник сам его вбил при оформлении продажи).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: inv.email,
    password: params.password,
    email_confirm: true,
  })
  if (createErr || !created?.user) {
    return { ok: false, error: createErr?.message || 'Не удалось создать аккаунт' }
  }
  const authUserId = created.user.id

  // 3. Создаём row в public.users с role='client', привязываем к existing auth.users.id
  const { data: existingPublic } = await admin
    .from('users').select('id').eq('email', inv.email).maybeSingle()
  if (existingPublic) {
    // Уже был row (например seed) — подменяем id на новый authUserId
    await admin.from('users').update({ id: authUserId, role: 'client' }).eq('id', existingPublic.id)
  } else {
    const { error: pubErr } = await admin.from('users').insert({
      id: authUserId,
      email: inv.email,
      role: 'client',
    })
    if (pubErr) {
      // Не критично — клиент сможет войти через auth.users
      console.error('[activateClientAccount] users insert failed:', pubErr.message)
    }
  }

  // 4. Помечаем invitation как использованный
  await admin.from('client_invitations')
    .update({ used_at: new Date().toISOString() })
    .eq('id', inv.id)

  // 5. Логиним пользователя через ssr client (cookies)
  const ssr = await createSsrClient()
  const { error: signInErr } = await ssr.auth.signInWithPassword({
    email: inv.email,
    password: params.password,
  })
  if (signInErr) {
    return { ok: false, error: `Аккаунт создан, но автологин не удался: ${signInErr.message}. Попробуй войти через /login.` }
  }

  return { ok: true }
}
