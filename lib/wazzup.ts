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
    throw new Error(`Wazzup send failed: ${res.status} ${err}`)
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

export async function downloadWazzupFile(uri: string): Promise<ArrayBuffer> {
  const res = await fetch(uri)
  if (!res.ok) throw new Error(`Wazzup file download failed: ${res.status}`)
  return res.arrayBuffer()
}

export type { WazzupMessage, ChatType, SendMessageParams }
