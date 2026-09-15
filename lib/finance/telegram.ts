/**
 * Телеграм финансового модуля.
 *
 * Это третий бот в проекте, и это не случайность: `TELEGRAM_BOT_TOKEN` слушает
 * клиентские чаты сделок, `TELEGRAM_BOOKINGS_BOT_TOKEN` шлёт записи на
 * консультацию. Смешивать их с деньгами нельзя — у финансового бота другой круг
 * доверия: его слушают только привязанные основатели в разрешённых чатах.
 *
 * Токен живёт в переменной окружения и не попадает ни в репозиторий, ни в
 * логи, ни в браузер.
 */

const API = 'https://api.telegram.org'

export type TgUser = { id: number; first_name?: string; last_name?: string; username?: string; is_bot?: boolean }
export type TgChat = { id: number; type: 'private' | 'group' | 'supergroup' | 'channel'; title?: string }
export type TgMessage = {
  message_id: number
  from?: TgUser
  chat: TgChat
  date: number
  text?: string
  caption?: string
  voice?: { file_id: string; duration: number; file_size?: number }
  reply_to_message?: TgMessage
}
export type TgUpdate = {
  update_id: number
  message?: TgMessage
  edited_message?: TgMessage
  callback_query?: { id: string; from: TgUser; message?: TgMessage; data?: string }
}

export function financeBotToken(): string | null {
  const token = process.env.TELEGRAM_FINANCE_BOT_TOKEN
  return token && token.trim().length > 20 ? token.trim() : null
}

export function financeBotConfigured(): boolean {
  return financeBotToken() !== null
}

async function call<T = any>(method: string, body: Record<string, unknown>): Promise<T | null> {
  const token = financeBotToken()
  if (!token) {
    console.error('[finance-tg] нет TELEGRAM_FINANCE_BOT_TOKEN — сообщение не отправлено')
    return null
  }
  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    if (!data.ok) {
      // Текст сообщения в лог не пишем: там деньги и имена людей.
      console.error(`[finance-tg] ${method} ответил ошибкой:`, String(data.description).slice(0, 200))
      return null
    }
    return data.result as T
  } catch (e) {
    console.error(`[finance-tg] ${method} не дошёл:`, e instanceof Error ? e.message : e)
    return null
  }
}

export type Button = { text: string; data: string }

export async function tgSend(chatId: number | string, text: string, buttons?: Button[][]) {
  return call('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(buttons?.length
      ? { reply_markup: { inline_keyboard: buttons.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) } }
      : {}),
  })
}

/** Ответ на нажатие кнопки: без него у человека крутится часик на кнопке. */
export async function tgAnswerCallback(callbackId: string, text?: string) {
  return call('answerCallbackQuery', { callback_query_id: callbackId, ...(text ? { text } : {}) })
}

export async function tgGetFileUrl(fileId: string): Promise<string | null> {
  const token = financeBotToken()
  if (!token) return null
  const info = await call<{ file_path: string }>('getFile', { file_id: fileId })
  return info?.file_path ? `${API}/file/bot${token}/${info.file_path}` : null
}

/**
 * Прописать вебхук. Секрет проверяется на входящем запросе: Telegram шлёт его
 * заголовком, и без этого любой, кто знает адрес, мог бы прислать «операцию».
 */
export async function tgSetWebhook(url: string, secret: string) {
  return call('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'edited_message', 'callback_query'],
    drop_pending_updates: false,
  })
}

export async function tgGetWebhookInfo() {
  return call('getWebhookInfo', {})
}

/** Имя бота — чтобы собрать ссылку вида t.me/бот?start=токен. */
export async function tgGetMe(): Promise<{ username?: string; first_name?: string } | null> {
  return call('getMe', {})
}

export function senderName(u?: TgUser): string {
  if (!u) return 'неизвестный'
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || (u.username ? `@${u.username}` : String(u.id))
}
