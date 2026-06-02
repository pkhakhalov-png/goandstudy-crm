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

  // 0. Reset-режим: если у куратора уже есть user_id и email совпадает с invite —
  //    invite используется как «задать новый пароль» (юзера не пересоздаём).
  const { data: curatorRow } = await admin
    .from('curators').select('id, user_id, email').eq('id', inv.curator_id).maybeSingle()

  let authUserId: string

  if (curatorRow?.user_id) {
    // Сравним email auth-юзера с email инвайта — не должны разойтись
    const { data: existingAuth } = await admin.auth.admin.getUserById(curatorRow.user_id)
    const existingEmail = existingAuth?.user?.email?.toLowerCase()
    if (existingEmail && existingEmail !== inv.email.toLowerCase()) {
      return { ok: false, error: 'Email инвайта не совпадает с email уже привязанного аккаунта. Попроси админа.' }
    }
    const { error: upErr } = await admin.auth.admin.updateUserById(curatorRow.user_id, {
      password: params.password,
      email: inv.email,
      email_confirm: true,
    })
    if (upErr) return { ok: false, error: `auth: ${upErr.message}` }
    authUserId = curatorRow.user_id
  } else {
    // Новый куратор: проверяем нет ли auth.users с этим email
    const { data: list } = await admin.auth.admin.listUsers()
    const dup = list?.users?.find(u => u.email?.toLowerCase() === inv.email.toLowerCase())
    if (dup) {
      return {
        ok: false,
        error: 'Аккаунт с этим email уже существует. Если забыл пароль — напиши админу.',
      }
    }

    // Создаём auth.users
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: inv.email,
      password: params.password,
      email_confirm: true,
    })
    if (createErr || !created?.user) {
      return { ok: false, error: createErr?.message || 'Не удалось создать аккаунт' }
    }
    authUserId = created.user.id
  }

  // public.users — role='curator'
  const { data: existingPublic } = await admin
    .from('users').select('id').eq('email', inv.email).maybeSingle()
  if (existingPublic) {
    if (existingPublic.id !== authUserId) {
      await admin.from('users').update({ id: authUserId, role: 'curator', is_active: true }).eq('id', existingPublic.id)
    } else {
      await admin.from('users').update({ role: 'curator', is_active: true }).eq('id', authUserId)
    }
  } else {
    await admin.from('users').insert({ id: authUserId, email: inv.email, role: 'curator', is_active: true })
  }

  // Привязываем curators.user_id (если ещё не привязан)
  if (!curatorRow?.user_id) {
    await admin.from('curators').update({ user_id: authUserId }).eq('id', inv.curator_id)
  }

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
