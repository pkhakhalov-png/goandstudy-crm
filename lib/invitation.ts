/**
 * Invite-ссылки для клиентов:
 *   - createClientInvitation(): создаёт row в client_invitations, возвращает URL
 *   - sendInvitationEmail(): отправляет email через Resend (опционально, если ключ
 *     не настроен — просто пропускаем).
 *
 * Сама инвайт-ссылка работает 30 дней, одноразовая (used_at).
 */

import { createAdminClient } from './supabase/server'
import { randomBytes } from 'crypto'

const INVITE_TTL_DAYS = 30
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.goandstudy.com'

export type InviteResult = {
  ok: true
  url: string
  emailSent: boolean
  emailError?: string
} | {
  ok: false
  error: string
}

/**
 * Создаёт invitation-ссылку для клиента.
 * Если у клиента уже есть активная неиспользованная ссылка — возвращает её
 * (не плодим дубли).
 */
export async function createClientInvitation(
  clientId: number,
  createdByUserId?: string,
): Promise<InviteResult> {
  const admin = await createAdminClient()

  // Загружаем клиента
  const { data: client, error: clientErr } = await admin
    .from('clients').select('id, email, name').eq('id', clientId).maybeSingle()
  if (clientErr || !client) return { ok: false, error: 'Клиент не найден' }
  if (!client.email) return { ok: false, error: 'У клиента не указан email' }

  // Проверяем, есть ли уже активная ссылка
  const now = new Date()
  const { data: existing } = await admin
    .from('client_invitations')
    .select('id, token, expires_at, used_at, email_sent_at')
    .eq('client_id', clientId)
    .is('used_at', null)
    .gt('expires_at', now.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    return {
      ok: true,
      url: `${APP_URL}/invite/${existing.token}`,
      emailSent: !!existing.email_sent_at,
    }
  }

  // Создаём новую
  const token = randomBytes(24).toString('hex')
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 86400_000)
  const { data: invite, error: insertErr } = await admin
    .from('client_invitations')
    .insert({
      client_id: clientId,
      token,
      email: client.email,
      expires_at: expiresAt.toISOString(),
      created_by: createdByUserId || null,
    })
    .select('id, token')
    .single()
  if (insertErr || !invite) return { ok: false, error: insertErr?.message || 'Не удалось создать invite' }

  const url = `${APP_URL}/invite/${invite.token}`

  // Отправляем email (если настроен Resend)
  let emailSent = false
  let emailError: string | undefined
  try {
    const r = await sendInvitationEmail({
      to: client.email,
      clientName: client.name || 'клиент',
      url,
    })
    emailSent = r.ok
    if (!r.ok) emailError = r.error
  } catch (e) {
    emailError = e instanceof Error ? e.message : 'unknown'
  }

  await admin.from('client_invitations')
    .update({
      email_sent_at: emailSent ? new Date().toISOString() : null,
      email_error: emailError || null,
    })
    .eq('id', invite.id)

  return { ok: true, url, emailSent, emailError }
}

/**
 * Отправка приглашения через Resend.
 * Если RESEND_API_KEY не настроен — возвращает {ok:false} тихо, не падает.
 */
async function sendInvitationEmail(params: {
  to: string
  clientName: string
  url: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY не настроен — email не отправлен' }
  }
  const fromAddress = process.env.RESEND_FROM_ADDRESS || 'GoAndStudy <noreply@goandstudy.com>'

  const html = `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #14121e;">
  <h1 style="font-size: 24px; margin: 0 0 16px;">Привет, ${params.clientName}!</h1>
  <p style="font-size: 15px; line-height: 1.5; color: #443f56;">
    Команда GoAndStudy подготовила для тебя личный кабинет — здесь ты увидишь
    подборку вузов, задачи, документы и сможешь общаться с куратором.
  </p>
  <p style="margin: 28px 0;">
    <a href="${params.url}" style="display: inline-block; background: #B15ECC; color: #fff; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">
      Активировать кабинет
    </a>
  </p>
  <p style="font-size: 13px; color: #8a8796; line-height: 1.5;">
    Ссылка действует 30 дней. Если кнопка не открывается, скопируй адрес:
    <br><span style="word-break: break-all;">${params.url}</span>
  </p>
</body>
</html>`

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [params.to],
        subject: 'Доступ в личный кабинет GoAndStudy',
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

/**
 * Welcome-письмо клиенту после успешной активации кабинета.
 * НЕ содержит пароль — только ссылку на /login и /client.
 */
export async function sendClientWelcomeEmail(params: {
  to: string
  clientName: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY не настроен' }
  const fromAddress = process.env.RESEND_FROM_ADDRESS || 'GoAndStudy <noreply@goandstudy.com>'
  const cabinetUrl = `${APP_URL}/client`
  const loginUrl = `${APP_URL}/login`

  const html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #14121e;">
  <h1 style="font-size: 24px; margin: 0 0 16px;">Привет, ${params.clientName}!</h1>
  <p style="font-size: 15px; line-height: 1.5; color: #443f56;">
    Кабинет создан, пароль сохранён. Можешь входить когда удобно — теперь у тебя
    в одном месте подборка вузов, документы, эссе и связь с куратором.
  </p>
  <p style="margin: 28px 0;">
    <a href="${cabinetUrl}" style="display: inline-block; background: #B15ECC; color: #fff; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">
      Открыть кабинет
    </a>
  </p>
  <p style="font-size: 13px; color: #8a8796; line-height: 1.6;">
    <b style="color: #14121e;">Email для входа:</b> ${params.to}<br>
    <b style="color: #14121e;">Страница входа:</b> <a href="${loginUrl}" style="color: #B15ECC;">${loginUrl}</a><br>
    <br>
    Пароль ты задал сам — он зашифрован и в письмо не попадает (стандартная
    практика безопасности). Если забудешь — напиши куратору, он сбросит.
  </p>
</body></html>`

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromAddress,
        to: [params.to],
        subject: 'Кабинет GoAndStudy готов — добро пожаловать!',
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

/** Найти invitation по токену + проверить срок и used_at. */
export type LookupResult =
  | { ok: false; error: string }
  | { ok: true; invitation: { id: string; client_id: number; email: string; expires_at: string; used_at: string | null } }

export async function lookupInvitation(token: string): Promise<LookupResult> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from('client_invitations')
    .select('id, client_id, email, expires_at, used_at')
    .eq('token', token)
    .maybeSingle()
  if (error || !data) return { ok: false, error: 'Ссылка недействительна' }
  if (data.used_at) return { ok: false, error: 'Эта ссылка уже использована' }
  if (new Date(data.expires_at) < new Date()) return { ok: false, error: 'Срок действия ссылки истёк (30 дней)' }
  return { ok: true, invitation: data as LookupResult extends { ok: true; invitation: infer I } ? I : never }
}
