/**
 * Invite-ссылки для регистрации кураторов в их кабинете.
 * Аналогично client-invitation, но привязано к curators.id и role='curator'.
 */

import { createAdminClient } from './supabase/server'
import { randomBytes } from 'crypto'

const INVITE_TTL_DAYS = 30
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.goandstudy.com'

export type CuratorInviteResult = {
  ok: true
  url: string
  emailSent: boolean
  emailError?: string
} | {
  ok: false
  error: string
}

/** Создать invite-ссылку для куратора. Идемпотентно: если активная есть — вернёт её. */
export async function createCuratorInvitation(
  curatorId: string,
  createdByUserId?: string,
): Promise<CuratorInviteResult> {
  const admin = await createAdminClient()
  const { data: curator, error } = await admin
    .from('curators').select('id, email, name, user_id').eq('id', curatorId).maybeSingle()
  if (error || !curator) return { ok: false, error: 'Куратор не найден' }
  if (!curator.email) return { ok: false, error: 'У куратора не указан email — заполни сначала' }
  if (curator.user_id) return { ok: false, error: 'Куратор уже активирован (привязан к auth-аккаунту)' }

  const now = new Date()
  const { data: existing } = await admin
    .from('curator_invitations')
    .select('id, token, expires_at, email_sent_at')
    .eq('curator_id', curatorId)
    .is('used_at', null)
    .gt('expires_at', now.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    return {
      ok: true,
      url: `${APP_URL}/invite/curator/${existing.token}`,
      emailSent: !!existing.email_sent_at,
    }
  }

  const token = randomBytes(24).toString('hex')
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 86400_000)
  const { data: invite, error: insertErr } = await admin
    .from('curator_invitations')
    .insert({
      curator_id: curatorId,
      token,
      email: curator.email,
      expires_at: expiresAt.toISOString(),
      created_by: createdByUserId || null,
    })
    .select('id, token').single()
  if (insertErr || !invite) return { ok: false, error: insertErr?.message || 'Не удалось создать invite' }

  const url = `${APP_URL}/invite/curator/${invite.token}`

  // Email через Resend (опционально)
  let emailSent = false
  let emailError: string | undefined
  try {
    const r = await sendCuratorInviteEmail({ to: curator.email, curatorName: curator.name || 'куратор', url })
    emailSent = r.ok
    if (!r.ok) emailError = r.error
  } catch (e) {
    emailError = e instanceof Error ? e.message : 'unknown'
  }

  await admin.from('curator_invitations')
    .update({ email_sent_at: emailSent ? new Date().toISOString() : null, email_error: emailError || null })
    .eq('id', invite.id)

  return { ok: true, url, emailSent, emailError }
}

async function sendCuratorInviteEmail(params: { to: string; curatorName: string; url: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY не настроен' }
  const fromAddress = process.env.RESEND_FROM_ADDRESS || 'GoAndStudy <noreply@goandstudy.com>'

  const html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #14121e;">
  <h1 style="font-size: 24px; margin: 0 0 16px;">Привет, ${params.curatorName}!</h1>
  <p style="font-size: 15px; line-height: 1.5; color: #443f56;">
    Тебя пригласили работать куратором в Go &amp; Study CRM. Перейди по ссылке
    чтобы задать пароль и попасть в кабинет.
  </p>
  <p style="margin: 28px 0;">
    <a href="${params.url}" style="display: inline-block; background: #B15ECC; color: #fff; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">
      Активировать кабинет
    </a>
  </p>
  <p style="font-size: 13px; color: #8a8796; line-height: 1.5;">
    Ссылка действует 30 дней.
    <br><span style="word-break: break-all;">${params.url}</span>
  </p>
</body></html>`

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromAddress,
        to: [params.to],
        subject: 'Кабинет куратора Go & Study',
        html,
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      return { ok: false, error: `Resend ${r.status}: ${body.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}

/** Welcome-письмо куратору после активации. Без пароля. */
export async function sendCuratorWelcomeEmail(params: {
  to: string; curatorName: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY не настроен' }
  const fromAddress = process.env.RESEND_FROM_ADDRESS || 'GoAndStudy <noreply@goandstudy.com>'
  const cabinetUrl = `${APP_URL}/curator`
  const loginUrl = `${APP_URL}/login`

  const html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #14121e;">
  <h1 style="font-size: 24px; margin: 0 0 16px;">Привет, ${params.curatorName}!</h1>
  <p style="font-size: 15px; line-height: 1.5; color: #443f56;">
    Кабинет куратора готов. Внутри — твои клиенты, их вузы, документы и стипендии.
  </p>
  <p style="margin: 28px 0;">
    <a href="${cabinetUrl}" style="display: inline-block; background: #B15ECC; color: #fff; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">
      Открыть кабинет
    </a>
  </p>
  <p style="font-size: 13px; color: #8a8796; line-height: 1.6;">
    <b style="color: #14121e;">Email:</b> ${params.to}<br>
    <b style="color: #14121e;">Вход:</b> <a href="${loginUrl}" style="color: #B15ECC;">${loginUrl}</a><br>
    Пароль ты задал сам — он зашифрован и в письме не пересылается. Если
    забудешь — попроси админа сбросить.
  </p>
</body></html>`

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromAddress, to: [params.to],
        subject: 'Кабинет куратора Go & Study готов',
        html,
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      return { ok: false, error: `Resend ${r.status}: ${body.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}

export type CuratorLookupResult =
  | { ok: false; error: string }
  | { ok: true; invitation: { id: string; curator_id: string; email: string; expires_at: string } }

export async function lookupCuratorInvitation(token: string): Promise<CuratorLookupResult> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from('curator_invitations')
    .select('id, curator_id, email, expires_at, used_at')
    .eq('token', token)
    .maybeSingle()
  if (error || !data) return { ok: false, error: 'Ссылка недействительна' }
  if (data.used_at) return { ok: false, error: 'Эта ссылка уже использована' }
  if (new Date(data.expires_at) < new Date()) return { ok: false, error: 'Срок действия ссылки истёк (30 дней)' }
  return { ok: true, invitation: data }
}
