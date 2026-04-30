/**
 * Direct Telegram Bot API client.
 * Used for group chats (where Wazzup tgapi can't show individual senders).
 *
 * Requires TELEGRAM_BOT_TOKEN env var.
 *
 * Bot setup:
 * 1. Create bot via @BotFather → /newbot → get token
 * 2. /setprivacy → Disable (so bot sees all messages in groups)
 * 3. Add bot to groups
 * 4. Register webhook via setTelegramWebhook()
 */

const TG_API = 'https://api.telegram.org'

function getToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not configured')
  return token
}

interface TelegramUser {
  id: number
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
}

interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
  username?: string
  first_name?: string
  last_name?: string
}

interface TelegramPhoto {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}

interface TelegramDocument {
  file_id: string
  file_unique_id: string
  file_name?: string
  mime_type?: string
  file_size?: number
}

export interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  sender_chat?: TelegramChat
  date: number
  chat: TelegramChat
  text?: string
  caption?: string
  photo?: TelegramPhoto[]
  document?: TelegramDocument
  voice?: { file_id: string; mime_type?: string; duration: number; file_size?: number }
  video?: { file_id: string; mime_type?: string; duration: number; file_size?: number; width: number; height: number }
  audio?: { file_id: string; mime_type?: string; duration: number; file_size?: number }
  reply_to_message?: TelegramMessage
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
  channel_post?: TelegramMessage
}

export async function setTelegramWebhook(url: string) {
  const res = await fetch(`${TG_API}/bot${getToken()}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      allowed_updates: ['message', 'edited_message', 'channel_post'],
    }),
  })
  return res.json()
}

export async function getTelegramWebhook() {
  const res = await fetch(`${TG_API}/bot${getToken()}/getWebhookInfo`)
  return res.json()
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  opts: { parseMode?: 'HTML' | 'MarkdownV2'; disableWebPreview?: boolean } = {},
) {
  const body: Record<string, unknown> = { chat_id: chatId, text }
  if (opts.parseMode) body.parse_mode = opts.parseMode
  if (opts.disableWebPreview ?? true) body.disable_web_page_preview = true

  const res = await fetch(`${TG_API}/bot${getToken()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`TG send failed: ${res.status} ${err}`)
  }
  return res.json()
}

/** Экранирование для HTML parse_mode. */
export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Уведомление о новой записи на консультацию.
 * Использует ОТДЕЛЬНЫЙ бот (TELEGRAM_BOOKINGS_BOT_TOKEN) и групповой чат
 * (TELEGRAM_BOOKINGS_CHAT_ID), чтобы не конфликтовать с основным
 * TELEGRAM_BOT_TOKEN, который смотрит на Wazzup-сообщения.
 *
 * Молча логирует ошибку и не ломает createBooking, если что-то не так.
 */
export async function notifyNewBooking(params: {
  salespersonName: string
  salespersonTgUsername: string | null
  date: string  // YYYY-MM-DD
  startTime: string  // HH:MM
  endTime: string  // HH:MM
  clientName: string
  clientPhone: string
  clientTelegram: string | null
  quizSummary?: string | null
}): Promise<void> {
  const token = process.env.TELEGRAM_BOOKINGS_BOT_TOKEN
  const chatId = process.env.TELEGRAM_BOOKINGS_CHAT_ID
  if (!chatId || !token) {
    console.log('[notifyNewBooking] TG не настроен (TELEGRAM_BOOKINGS_BOT_TOKEN / TELEGRAM_BOOKINGS_CHAT_ID) — пропускаем уведомление')
    return
  }

  const tag = params.salespersonTgUsername
    ? `@${params.salespersonTgUsername.replace(/^@/, '')}`
    : `<b>${escHtml(params.salespersonName)}</b> (TG не задан)`

  let dateLabel = params.date
  try {
    dateLabel = new Date(params.date + 'T12:00:00.000Z').toLocaleDateString('ru', {
      day: 'numeric', month: 'long', timeZone: 'Europe/Moscow',
    })
  } catch {}

  const tg = params.clientTelegram
    ? `\n💬 TG: ${escHtml(params.clientTelegram.startsWith('@') ? params.clientTelegram : '@' + params.clientTelegram)}`
    : ''

  const quiz = params.quizSummary ? `\n\n${escHtml(params.quizSummary)}` : ''

  const text = `🆕 <b>Новая запись на консультацию</b>
${tag}

🗓 ${escHtml(dateLabel)} · ${escHtml(params.startTime)}–${escHtml(params.endTime)} (МСК)
👤 ${escHtml(params.clientName)}
📞 ${escHtml(params.clientPhone)}${tg}${quiz}`

  try {
    const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[notifyNewBooking] TG API error', res.status, body.slice(0, 200))
    }
  } catch (e: unknown) {
    console.error('[notifyNewBooking] failed:', e instanceof Error ? e.message : e)
  }
}

/**
 * Get file info + download URL via Bot API.
 * Returns the file path (relative to TG file server) which can be used to download.
 */
export async function getTelegramFileUrl(fileId: string): Promise<string> {
  const res = await fetch(`${TG_API}/bot${getToken()}/getFile?file_id=${encodeURIComponent(fileId)}`)
  if (!res.ok) throw new Error(`getFile failed: ${res.status}`)
  const data = await res.json() as { ok: boolean; result?: { file_path: string } }
  if (!data.ok || !data.result) throw new Error('getFile returned no result')
  return `${TG_API}/file/bot${getToken()}/${data.result.file_path}`
}

export async function downloadTelegramFile(fileId: string): Promise<{ buffer: ArrayBuffer; url: string }> {
  const url = await getTelegramFileUrl(fileId)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  return { buffer: await res.arrayBuffer(), url }
}

export function buildSenderName(user: TelegramUser | undefined): string {
  if (!user) return 'Неизвестный'
  const parts = [user.first_name, user.last_name].filter(Boolean)
  if (parts.length > 0) return parts.join(' ')
  if (user.username) return `@${user.username}`
  return `id_${user.id}`
}
