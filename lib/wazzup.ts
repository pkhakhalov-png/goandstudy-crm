/**
 * Wazzup24 API client
 * Docs: https://wazzup24.com/help/api-ru/
 */

const WAZZUP_API = 'https://api.wazzup24.com/v3'

type ChatType = 'whatsapp' | 'telegram' | 'tgapi' | 'instagram'

interface SendMessageParams {
  channelId: string
  chatType: ChatType
  chatId: string  // phone for WA (79...), username/id for TG
  text?: string
  contentUri?: string  // for file attachments
}

interface WazzupAuthor {
  id?: string
  name?: string
  username?: string
  phone?: string
  avatarUri?: string
}

interface WazzupMessage {
  messageId: string
  channelId: string
  chatType: ChatType
  chatId: string
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'vcard' | 'geo'
  isEcho: boolean
  text?: string
  contentUri?: string
  dateTime: string
  contact?: {
    name?: string
    avatarUri?: string
    username?: string
    phone?: string
  }
  // For group chats — info about the actual sender (contact is the group)
  author?: WazzupAuthor
  sender?: WazzupAuthor
  from?: WazzupAuthor
  authorName?: string
  // Catch-all for unknown fields so we can log them
  [key: string]: any
}

function getKey() {
  const key = process.env.WAZZUP_API_KEY
  if (!key) throw new Error('WAZZUP_API_KEY not configured')
  return key
}

export async function sendWazzupMessage(params: SendMessageParams) {
  const body = JSON.stringify(params)
  console.log('[wazzup send] body:', body)

  const res = await fetch(`${WAZZUP_API}/message`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getKey()}`,
      'Content-Type': 'application/json',
    },
    body,
  })

  if (!res.ok) {
    const err = await res.text()
    console.log('[wazzup send] error:', res.status, err)
    // Include the sent body in the error so we can see exactly what was rejected
    throw new Error(`Wazzup send failed: ${res.status} ${err} | sent: ${body}`)
  }

  return res.json() as Promise<{ messageId: string }>
}

export async function getWazzupChannels() {
  const res = await fetch(`${WAZZUP_API}/channels`, {
    headers: { 'Authorization': `Bearer ${getKey()}` },
  })
  if (!res.ok) throw new Error(`Wazzup channels failed: ${res.status}`)
  return res.json() as Promise<Array<{
    channelId: string
    transport: ChatType
    state: string
    plainId?: string
    name?: string
  }>>
}

// Cache tgapi channel id in module memory — channels list rarely changes.
let cachedTgapiChannelId: string | null = null
export async function getTgapiChannelId(): Promise<string> {
  const fromEnv = (process.env.WAZZUP_TGAPI_CHANNEL_ID ?? '').trim()
  if (fromEnv) return fromEnv
  if (cachedTgapiChannelId) return cachedTgapiChannelId
  const channels = await getWazzupChannels()
  const tgapi = channels.find(c => c.transport === 'tgapi' && c.state !== 'disabled')
  if (!tgapi) throw new Error('Не найден активный tgapi-канал в Wazzup. Подключи личный TG-аккаунт в Wazzup или задай WAZZUP_TGAPI_CHANNEL_ID.')
  cachedTgapiChannelId = tgapi.channelId
  return cachedTgapiChannelId
}

export async function downloadWazzupFile(uri: string): Promise<ArrayBuffer> {
  const res = await fetch(uri)
  if (!res.ok) throw new Error(`Wazzup file download failed: ${res.status}`)
  return res.arrayBuffer()
}

export type { WazzupMessage, ChatType, SendMessageParams }
