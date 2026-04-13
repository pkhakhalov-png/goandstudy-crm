import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'
import { downloadWazzupFile, type WazzupMessage } from '@/lib/wazzup'

interface WebhookPayload {
  messages?: WazzupMessage[]
  test?: boolean
}

export async function POST(req: NextRequest) {
  try {
    // Log raw body to debug Wazzup payload format
    const rawBody = await req.text()
    console.log('[wazzup webhook] raw body:', rawBody.slice(0, 2000))

    if (!rawBody || rawBody.trim() === '') {
      console.log('[wazzup webhook] empty body — verification ping')
      return NextResponse.json({ ok: true })
    }

    let payload: WebhookPayload
    try {
      payload = JSON.parse(rawBody) as WebhookPayload
    } catch {
      console.log('[wazzup webhook] not valid JSON, returning ok')
      return NextResponse.json({ ok: true })
    }

    console.log('[wazzup webhook] parsed:', JSON.stringify(payload).slice(0, 1000))

    if (payload.test) return NextResponse.json({ ok: true })

    const messages = payload.messages ?? []
    console.log('[wazzup webhook] messages count:', messages.length)
    if (messages.length === 0) return NextResponse.json({ ok: true })

    const supabase = await createAdminClient()

    for (const msg of messages) {
      console.log('[wazzup webhook] processing msg:', msg.messageId, 'chatType:', msg.chatType, 'chatId:', msg.chatId, 'isEcho:', msg.isEcho)
      await processMessage(supabase, msg)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[wazzup webhook] error:', err)
    return NextResponse.json({ ok: false, error: String(err) })
  }
}

// Wazzup requires GET to return 200 on webhook verification
export async function GET() {
  return NextResponse.json({ ok: true })
}

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminClient>>

// Detect group chats: Telegram groups have chatId starting with "-" (like -1001234567890)
// Or chatId that doesn't look like a phone number
function isGroupChat(chatId: string): boolean {
  if (!chatId) return false
  if (chatId.startsWith('-')) return true
  // Phone numbers are 10-15 digits. Group IDs usually don't fit this.
  const digits = chatId.replace(/\D/g, '')
  if (digits.length >= 10 && digits.length <= 15 && /^\d+$/.test(chatId)) return false
  return true
}

// Try to find the real author from various possible Wazzup payload shapes
function extractAuthor(msg: WazzupMessage): { name: string | null; id: string | null } {
  // Priority order — try author, sender, from, authorName
  const candidates = [
    msg.author,
    msg.sender,
    msg.from,
    (msg as any).authorData,
  ]
  for (const c of candidates) {
    if (c && typeof c === 'object') {
      const name = c.name || c.username || c.phone
      if (name) return { name, id: c.id || c.username || c.phone || null }
    }
  }
  if (msg.authorName) return { name: msg.authorName, id: null }
  return { name: null, id: null }
}

async function processMessage(supabase: SupabaseAdmin, msg: WazzupMessage) {
  const isTg = msg.chatType === 'telegram' || msg.chatType === 'tgapi'
  const isGroup = isGroupChat(msg.chatId)
  const rawPhone = isGroup ? null : (msg.contact?.phone || (msg.chatType === 'whatsapp' ? msg.chatId : (msg.chatType === 'tgapi' ? msg.chatId : null)))
  const normalizedPhone = normalizePhone(rawPhone)

  // For groups, prefer real author from dedicated fields, fallback to contact
  const author = extractAuthor(msg)
  const senderName = isGroup
    ? (author.name || msg.contact?.name || msg.chatId)  // group: try real author first
    : (msg.contact?.name || msg.contact?.username || rawPhone || msg.chatId)

  const groupTitle = isGroup ? (msg.contact?.name || `Группа ${msg.chatId}`) : null

  // Debug: log full msg payload for groups to discover field structure
  if (isGroup) {
    console.log('[wazzup group msg]', JSON.stringify({
      chatId: msg.chatId,
      contactName: msg.contact?.name,
      contactUsername: msg.contact?.username,
      author: msg.author,
      sender: msg.sender,
      from: msg.from,
      authorName: msg.authorName,
      extractedAuthor: author,
      allKeys: Object.keys(msg),
    }))
  }

  const channelLabel = msg.chatType === 'whatsapp' ? 'whatsapp' : 'telegram'

  let dealId: string | null = null

  // STEP 1: Look up existing deal by Wazzup chatId in metadata (most reliable — works for both group and individual)
  // We stored chatId in deal_messages.metadata.chatId when we previously received a message from this chat
  const { data: prevMsg } = await supabase
    .from('deal_messages')
    .select('deal_id')
    .eq('metadata->>chatId', msg.chatId)
    .not('deal_id', 'is', null)
    .limit(1)
    .maybeSingle()

  if (prevMsg?.deal_id) {
    // Make sure that deal is not deleted
    const { data: dealExists } = await supabase
      .from('deals')
      .select('id')
      .eq('id', prevMsg.deal_id)
      .is('deleted_at', null)
      .maybeSingle()
    if (dealExists) dealId = dealExists.id
  }

  // STEP 2: For individual (non-group) chats, fallback to phone-based lookup
  if (!dealId && !isGroup && normalizedPhone) {
    const { data: existingDeal } = await supabase
      .from('deals')
      .select('id')
      .eq('phone_normalized', normalizedPhone)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    if (existingDeal) dealId = existingDeal.id
  }

  if (!dealId && !isGroup && isTg && msg.contact?.username) {
    const { data: existingDeal } = await supabase
      .from('deals')
      .select('id')
      .or(`contact_telegram.eq.${msg.contact.username},contact_telegram.eq.@${msg.contact.username}`)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    if (existingDeal) dealId = existingDeal.id
  }

  // STEP 3: No deal found — create new one (only for incoming)
  if (!dealId && !msg.isEcho) {
    // Pick stage: for groups try to find one with "групп" in name, fallback to first active stage
    let chosenStage = null
    if (isGroup) {
      const { data: groupStage } = await supabase
        .from('pipeline_stages')
        .select('id, position')
        .eq('is_active', true)
        .ilike('name', '%групп%')
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (groupStage) chosenStage = groupStage
    }
    if (!chosenStage) {
      const { data: firstStage } = await supabase
        .from('pipeline_stages')
        .select('id, position')
        .eq('is_active', true)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle()
      chosenStage = firstStage
    }

    if (!chosenStage) {
      console.error('[wazzup] no active pipeline stage found')
      return
    }

    // Round-robin assign
    const { data: salespersons } = await supabase
      .from('users')
      .select('id, round_robin_count')
      .eq('role', 'salesperson')
      .eq('is_active', true)
      .order('round_robin_count', { ascending: true })
      .limit(1)

    const assignedId = salespersons?.[0]?.id ?? null

    const { data: newDeal } = await supabase
      .from('deals')
      .insert({
        title: isGroup ? `Группа: ${groupTitle}` : `Сообщение от ${senderName}`,
        stage_id: chosenStage.id,
        salesperson_id: assignedId,
        contact_name: isGroup ? (groupTitle as string) : senderName,
        contact_phone: isGroup ? null : rawPhone,
        phone_normalized: isGroup ? null : normalizedPhone,
        contact_telegram: isGroup ? null : (isTg ? msg.contact?.username || null : null),
        contact_whatsapp: isGroup ? null : (msg.chatType === 'whatsapp' ? rawPhone : null),
        source: isGroup ? `${channelLabel}_group` : channelLabel,
        custom_fields: isGroup ? { wazzup_chat_id: msg.chatId, is_group: true } : {},
      })
      .select('id')
      .single()

    if (newDeal) {
      dealId = newDeal.id

      if (assignedId) {
        await supabase
          .from('users')
          .update({ round_robin_count: (salespersons?.[0]?.round_robin_count ?? 0) + 1 })
          .eq('id', assignedId)
      }

      await supabase.from('deal_activities').insert({
        deal_id: dealId,
        activity_type: 'system',
        content: isGroup
          ? `Групповой чат создан из ${channelLabel === 'whatsapp' ? 'WhatsApp' : 'Telegram'}`
          : `Сделка создана из ${channelLabel === 'whatsapp' ? 'WhatsApp' : 'Telegram'}`,
      })
    }
  }

  if (!dealId) return

  // Handle file attachment
  let fileId: string | null = null
  if (msg.contentUri && msg.type !== 'text') {
    try {
      const buffer = await downloadWazzupFile(msg.contentUri)
      const ext = msg.type === 'image' ? 'jpg' : msg.type === 'video' ? 'mp4' : msg.type === 'audio' ? 'mp3' : 'bin'
      const fileName = `wazzup-${msg.messageId}.${ext}`
      const path = `deal-files/${dealId}/${fileName}`

      const { error: uploadErr } = await supabase.storage
        .from('deal-files')
        .upload(path, buffer, {
          contentType: msg.type === 'image' ? 'image/jpeg' : msg.type === 'video' ? 'video/mp4' : 'application/octet-stream',
          upsert: false,
        })

      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('deal-files').getPublicUrl(path)
        const { data: insertedFile } = await supabase
          .from('deal_files')
          .insert({
            deal_id: dealId,
            name: fileName,
            url: urlData.publicUrl,
            mime_type: msg.type === 'image' ? 'image/jpeg' : msg.type === 'video' ? 'video/mp4' : 'application/octet-stream',
            source: channelLabel,
          })
          .select('id')
          .single()
        if (insertedFile) fileId = insertedFile.id
      }
    } catch (e) {
      console.error('[wazzup] file save failed:', e)
    }
  }

  // Dedupe by external_id
  const { data: existing } = await supabase
    .from('deal_messages')
    .select('id, file_id')
    .eq('external_id', msg.messageId)
    .maybeSingle()

  if (existing) {
    if (fileId && !existing.file_id) {
      await supabase.from('deal_messages').update({ file_id: fileId }).eq('id', existing.id)
    }
  } else {
    await supabase.from('deal_messages').insert({
      deal_id: dealId,
      direction: msg.isEcho ? 'outgoing' : 'incoming',
      channel: msg.chatType === 'whatsapp' ? 'whatsapp' : 'telegram',
      sender_name: senderName,
      content: msg.text || (msg.type !== 'text' ? `[${msg.type}]` : ''),
      file_id: fileId,
      external_id: msg.messageId,
      metadata: { channelId: msg.channelId, chatId: msg.chatId, type: msg.type },
    })
  }

  // Bump deal updated_at so it rises to the top of the kanban
  await supabase.from('deals').update({ updated_at: new Date().toISOString() }).eq('id', dealId)

  // Log activity
  await supabase.from('deal_activities').insert({
    deal_id: dealId,
    activity_type: 'message',
    content: msg.isEcho
      ? `Исходящее ${channelLabel}: ${(msg.text || msg.type).slice(0, 100)}`
      : `Входящее ${channelLabel}: ${(msg.text || msg.type).slice(0, 100)}`,
    metadata: { channel: channelLabel, direction: msg.isEcho ? 'outgoing' : 'incoming' },
  })
}
