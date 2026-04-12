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

async function processMessage(supabase: SupabaseAdmin, msg: WazzupMessage) {
  // chatId: for WA = "79146666266", for TG = username or "id_12345"
  // Normalize phone from chatId or contact.phone
  const isTg = msg.chatType === 'telegram' || msg.chatType === 'tgapi'
  const rawPhone = msg.contact?.phone || (msg.chatType === 'whatsapp' ? msg.chatId : (msg.chatType === 'tgapi' ? msg.chatId : null))
  const normalizedPhone = normalizePhone(rawPhone)
  const senderName = msg.contact?.name || msg.contact?.username || rawPhone || msg.chatId
  const channelLabel = msg.chatType === 'whatsapp' ? 'whatsapp' : 'telegram'

  // Find deal by phone_normalized (fast indexed lookup)
  let dealId: string | null = null

  if (normalizedPhone) {
    const { data: existingDeal } = await supabase
      .from('deals')
      .select('id')
      .eq('phone_normalized', normalizedPhone)
      .is('deleted_at', null)
      .limit(1)
      .single()
    if (existingDeal) dealId = existingDeal.id
  }

  // For telegram messages by username, try matching contact_telegram
  if (!dealId && isTg && msg.contact?.username) {
    const { data: existingDeal } = await supabase
      .from('deals')
      .select('id')
      .or(`contact_telegram.eq.${msg.contact.username},contact_telegram.eq.@${msg.contact.username}`)
      .is('deleted_at', null)
      .limit(1)
      .single()
    if (existingDeal) dealId = existingDeal.id
  }

  // No deal found — create new one in first active stage (only for incoming, not echo)
  if (!dealId && !msg.isEcho) {
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('is_active', true)
      .order('position', { ascending: true })
      .limit(1)
      .single()

    if (!firstStage) {
      console.error('[wazzup] no active pipeline stage found')
      return
    }

    // Round-robin assign to a salesperson
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
        title: `Сообщение от ${senderName}`,
        stage_id: firstStage.id,
        salesperson_id: assignedId,
        contact_name: senderName,
        contact_phone: rawPhone,
        phone_normalized: normalizedPhone,
        contact_telegram: isTg ? msg.contact?.username || null : null,
        contact_whatsapp: msg.chatType === 'whatsapp' ? rawPhone : null,
        source: channelLabel,
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
        content: `Сделка создана из ${channelLabel === 'whatsapp' ? 'WhatsApp' : 'Telegram'}`,
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
