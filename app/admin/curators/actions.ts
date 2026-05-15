'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { randomBytes } from 'crypto'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.goandstudy.com'
const INVITE_TTL_DAYS = 30

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' as const }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Только админ' as const }
  return { error: null }
}

export async function createCurator(formData: FormData) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }

  const name = (formData.get('name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim()
  const password = (formData.get('password') as string)?.trim()
  const telegramUsername = (formData.get('telegram_username') as string)?.trim() || null
  const maxClients = Number(formData.get('max_clients') || 20)
  const specializations = (formData.get('specializations') as string)?.split(',').map(s => s.trim()).filter(Boolean) || []
  const languages = (formData.get('languages') as string)?.split(',').map(s => s.trim()).filter(Boolean) || []

  if (!name || !email || !password) {
    return { error: 'Заполните имя, email и пароль' }
  }

  if (password.length < 6) {
    return { error: 'Пароль должен быть минимум 6 символов' }
  }

  const admin = await createAdminClient()

  // 1. Create auth user
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  })

  if (authError) {
    if (authError.message.includes('already') || authError.message.includes('exists')) {
      return { error: `Пользователь с email ${email} уже существует` }
    }
    return { error: `Ошибка создания: ${authError.message}` }
  }

  const userId = authData.user.id

  // 2. Upsert into public.users
  const { error: usersErr } = await admin
    .from('users')
    .upsert({ id: userId, email, name, role: 'curator', is_active: true }, { onConflict: 'id' })

  if (usersErr) {
    return { error: `Ошибка users: ${usersErr.message}` }
  }

  // 3. Insert into public.curators
  const { error: curatorErr } = await admin
    .from('curators')
    .insert({
      name,
      contact: email,
      is_active: true,
      user_id: userId,
      specializations: specializations.length > 0 ? specializations : null,
      languages: languages.length > 0 ? languages : null,
      max_clients: maxClients,
      telegram_username: telegramUsername,
    })

  if (curatorErr) {
    return { error: `Ошибка curators: ${curatorErr.message}` }
  }

  revalidatePath('/admin/curators')
  redirect('/admin/curators')
}

export async function updateCurator(curatorId: string, formData: FormData) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }

  const name = (formData.get('name') as string)?.trim()
  const telegramUsername = (formData.get('telegram_username') as string)?.trim() || null
  const maxClients = Number(formData.get('max_clients') || 20)
  const isActive = formData.get('is_active') === 'true'
  const specializations = (formData.get('specializations') as string)?.split(',').map(s => s.trim()).filter(Boolean) || []
  const languages = (formData.get('languages') as string)?.split(',').map(s => s.trim()).filter(Boolean) || []

  if (!name) return { error: 'Имя обязательно' }

  const admin = await createAdminClient()

  const { error } = await admin
    .from('curators')
    .update({
      name,
      is_active: isActive,
      specializations: specializations.length > 0 ? specializations : null,
      languages: languages.length > 0 ? languages : null,
      max_clients: maxClients,
      telegram_username: telegramUsername,
    })
    .eq('id', curatorId)

  if (error) return { error: error.message }

  // Also update name in users table if linked
  const { data: curator } = await admin.from('curators').select('user_id').eq('id', curatorId).single()
  if (curator?.user_id) {
    await admin.from('users').update({ name, is_active: isActive }).eq('id', curator.user_id)
  }

  revalidatePath('/admin/curators')
  revalidatePath(`/admin/curators/${curatorId}`)
  return { success: true }
}

/* ───────────────────────────────────────────────────────────────────────
   ДОСТУП КУРАТОРА — invite-ссылка или сброс пароля.
   Из админки одной кнопкой получаем готовое сообщение для отправки.
   ─────────────────────────────────────────────────────────────────────── */

export type AccessResult =
  | { kind: 'error'; error: string }
  | { kind: 'invite'; email: string; url: string; emailSent: boolean; emailError?: string }
  | { kind: 'reset';  email: string; password: string; loginUrl: string; emailSent: boolean; emailError?: string }

function genPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const buf = randomBytes(12)
  let s = ''
  for (let i = 0; i < 12; i++) s += chars[buf[i] % chars.length]
  return s
}

export async function prepareCuratorAccess(curatorId: string): Promise<AccessResult> {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { kind: 'error', error: authErr }

  const admin = await createAdminClient()
  const { data: curator } = await admin
    .from('curators').select('id, name, email, contact, user_id').eq('id', curatorId).maybeSingle()
  if (!curator) return { kind: 'error', error: 'Куратор не найден' }

  const email = curator.email || curator.contact
  if (!email) return { kind: 'error', error: 'У куратора не указан email — заполни в карточке' }

  // Если кабинет активирован — ставим новый пароль
  if (curator.user_id) {
    const password = genPassword()
    const { error: upErr } = await admin.auth.admin.updateUserById(curator.user_id, {
      password, email, email_confirm: true,
    })
    if (upErr) return { kind: 'error', error: `auth: ${upErr.message}` }
    await admin.from('users').update({ email, name: curator.name, role: 'curator', is_active: true })
      .eq('id', curator.user_id)
    // sync curators.email тоже
    if (!curator.email) await admin.from('curators').update({ email }).eq('id', curatorId)

    const { sent, error: mailErr } = await sendWelcomeEmail({ to: email, name: curator.name || '', password })
    return {
      kind: 'reset', email, password,
      loginUrl: `${APP_URL}/login`,
      emailSent: sent, emailError: mailErr,
    }
  }

  // Иначе — создаём invitation (или возвращаем существующую активную)
  const now = new Date()
  const { data: existing } = await admin
    .from('curator_invitations')
    .select('id, token, expires_at, email_sent_at')
    .eq('curator_id', curatorId).is('used_at', null).gt('expires_at', now.toISOString())
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  let token = existing?.token as string | undefined
  if (!token) {
    token = randomBytes(24).toString('hex')
    const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 86400_000)
    const { error: insErr } = await admin.from('curator_invitations').insert({
      curator_id: curatorId, token, email,
      expires_at: expiresAt.toISOString(),
    })
    if (insErr) return { kind: 'error', error: `invite: ${insErr.message}` }
    if (!curator.email) await admin.from('curators').update({ email }).eq('id', curatorId)
  }

  const url = `${APP_URL}/invite/curator/${token}`
  const { sent, error: mailErr } = await sendInviteEmail({ to: email, name: curator.name || '', url })
  if (sent && token && !existing?.email_sent_at) {
    await admin.from('curator_invitations').update({ email_sent_at: new Date().toISOString() }).eq('token', token)
  }

  return { kind: 'invite', email, url, emailSent: sent, emailError: mailErr }
}

async function sendInviteEmail(p: { to: string; name: string; url: string }): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY не настроен — скопируй ссылку вручную' }
  const from = process.env.RESEND_FROM_ADDRESS || 'GoAndStudy <noreply@goandstudy.com>'
  const html = `<!DOCTYPE html><html lang="ru"><body style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#14121e">
    <h1 style="font-size:22px;margin:0 0 16px">Привет, ${p.name}!</h1>
    <p style="font-size:15px;line-height:1.5;color:#443f56">Тебя пригласили работать куратором в GoAndStudy CRM. Активируй кабинет — задашь свой пароль:</p>
    <p style="margin:28px 0"><a href="${p.url}" style="display:inline-block;background:#B15ECC;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600">Активировать кабинет</a></p>
    <p style="font-size:13px;color:#8a8796">Ссылка живёт 30 дней.<br><span style="word-break:break-all">${p.url}</span></p>
  </body></html>`
  return resendPost(apiKey, from, p.to, 'Кабинет куратора GoAndStudy', html)
}

async function sendWelcomeEmail(p: { to: string; name: string; password: string }): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY не настроен — скопируй пароль вручную' }
  const from = process.env.RESEND_FROM_ADDRESS || 'GoAndStudy <noreply@goandstudy.com>'
  const loginUrl = `${APP_URL}/login`
  const html = `<!DOCTYPE html><html lang="ru"><body style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#14121e">
    <h1 style="font-size:22px;margin:0 0 16px">Привет, ${p.name}!</h1>
    <p style="font-size:15px;line-height:1.5;color:#443f56">Кабинет куратора GoAndStudy готов. Вот данные для входа:</p>
    <p style="font-size:14px;line-height:1.8">
      <b>Email:</b> ${p.to}<br>
      <b>Пароль:</b> <code style="background:#f4f3f8;padding:3px 7px;border-radius:4px">${p.password}</code><br>
      <b>Вход:</b> <a href="${loginUrl}" style="color:#B15ECC">${loginUrl}</a>
    </p>
    <p style="margin:28px 0"><a href="${loginUrl}" style="display:inline-block;background:#B15ECC;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600">Войти в кабинет</a></p>
    <p style="font-size:13px;color:#8a8796">Сохрани письмо. Если потеряешь пароль — попроси админа сбросить.</p>
  </body></html>`
  return resendPost(apiKey, from, p.to, 'Кабинет куратора GoAndStudy готов', html)
}

async function resendPost(apiKey: string, from: string, to: string, subject: string, html: string): Promise<{ sent: boolean; error?: string }> {
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      return { sent: false, error: `Resend ${r.status}: ${body.slice(0, 200)}` }
    }
    return { sent: true }
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}
