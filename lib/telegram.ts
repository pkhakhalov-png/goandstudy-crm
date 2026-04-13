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

export async function sendTelegramMessage(chatId: number | string, text: string) {
  const res = await fetch(`${TG_API}/bot${getToken()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`TG send failed: ${res.status} ${err}`)
  }
  return res.json()
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
