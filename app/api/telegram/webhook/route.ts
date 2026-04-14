import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import {
  type TelegramUpdate,
  type TelegramMessage,
  buildSenderName,
  downloadTelegramFile,
} from '@/lib/telegram'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const update = (await req.json()) as TelegramUpdate
    const msg = update.message || update.edited_message || update.channel_post

    if (!msg) return NextResponse.json({ ok: true })

    const supabase = await createAdminClient()
    await processTelegramMessage(supabase, msg, !!update.edited_message)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[telegram webhook] error:', err)
    // Return 200 so Telegram doesn't retry on our bug
    return NextResponse.json({ ok: false, error: String(err) })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: 'Telegram webhook endpoint' })
}

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminClient>>

async function processTelegramMessage(
  supabase: SupabaseAdmin,
  msg: TelegramMessage,
  isEdited: boolean,
) {
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup'
  const chatIdStr = String(msg.chat.id)
  const externalId = `tg_${msg.chat.id}_${msg.message_id}`

  // Skip our own bot messages (echo)
  if (msg.from?.is_bot) return

  // Real sender name
  const senderName = buildSenderName(msg.from)

  // Resolve / create deal
  let dealId: string | null = null

  // Lookup existing deal by chat id — check both legacy keys (tgChatId from TG bot,
  // chatId from Wazzup) so the two webhooks don't create parallel deals for the same group.
  const { data: dealByCustom } = await supabase
    .from('deals')
    .select('id')
    .or(
      `custom_fields->>group_chat_id.eq.${chatIdStr},custom_fields->>tg_chat_id.eq.${chatIdStr},custom_fields->>wazzup_chat_id.eq.${chatIdStr}`,
    )
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (dealByCustom) {
    dealId = dealByCustom.id
  } else {
    const { data: prevMsg } = await supabase
      .from('deal_messages')
      .select('deal_id')
      .or(`metadata->>tgChatId.eq.${chatIdStr},metadata->>chatId.eq.${chatIdStr}`)
      .not('deal_id', 'is', null)
      .limit(1)
      .maybeSingle()
    if (prevMsg?.deal_id) {
      const { data: dealExists } = await supabase
        .from('deals')
        .select('id')
        .eq('id', prevMsg.deal_id)
        .is('deleted_at', null)
        .maybeSingle()
      if (dealExists) dealId = dealExists.id
    }
  }

  // Create new deal if not found
  if (!dealId) {
    // Pick stage: groups whose title starts with "Релокац" → "Релокац" stage;
    // other groups → "Группы" stage; fallback to first active.
    let chosenStage = null
    const titleForRouting = msg.chat.title || ''
    const isRelocation = isGroup && /^релокац/i.test(titleForRouting.trim())
    if (isRelocation) {
      const { data: relocStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('is_active', true)
        .ilike('name', 'релокац%')
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle()
      chosenStage = relocStage
    }
    if (!chosenStage && isGroup) {
      const { data: groupStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('is_active', true)
        .ilike('name', '%групп%')
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle()
      chosenStage = groupStage
    }
    if (!chosenStage) {
      const { data: firstStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('is_active', true)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle()
      chosenStage = firstStage
    }
    if (!chosenStage) {
      console.error('[telegram] no active pipeline stage')
      return
    }

    // Round-robin salesperson
    const { data: salespersons } = await supabase
      .from('users')
      .select('id, round_robin_count')
      .eq('role', 'salesperson')
      .eq('is_active', true)
      .order('round_robin_count', { ascending: true })
      .limit(1)
    const assignedId = salespersons?.[0]?.id ?? null

    const dealTitle = isGroup
      ? `Группа: ${msg.chat.title || 'без названия'}`
      : `Сообщение от ${senderName}`
    const dealContact = isGroup
      ? (msg.chat.title || 'Группа')
      : senderName

    const { data: newDeal, error: insertErr } = await supabase
      .from('deals')
      .insert({
        title: dealTitle,
        stage_id: chosenStage.id,
        salesperson_id: assignedId,
        contact_name: dealContact,
        contact_telegram: !isGroup && msg.from?.username ? `@${msg.from.username}` : null,
        source: isGroup ? 'telegram_group_bot' : 'telegram_bot',
        custom_fields: {
          group_chat_id: chatIdStr,
          tg_chat_id: msg.chat.id,
          tg_chat_type: msg.chat.type,
          tg_chat_title: msg.chat.title,
          is_group: isGroup,
        },
      })
      .select('id')
      .single()

    // If a parallel webhook just created the same group deal, the unique index on
    // group_chat_id raises a conflict — re-fetch the existing row instead of duplicating.
    if (insertErr && isGroup) {
      const { data: raceDeal } = await supabase
        .from('deals')
        .select('id')
        .eq('custom_fields->>group_chat_id', chatIdStr)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle()
      if (raceDeal) dealId = raceDeal.id
    }

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
          ? `Групповой чат «${msg.chat.title}» подключён через Telegram бота`
          : `Личный чат с ${senderName} подключён через Telegram бота`,
      })
    }
  }

  if (!dealId) return

  // Handle attachments
  let fileId: string | null = null
  let mediaType: string | null = null
  let mediaFileId: string | null = null
  let mediaName: string | null = null
  let mediaMime: string | null = null

  if (msg.photo && msg.photo.length > 0) {
    // Take the largest photo
    const largest = msg.photo[msg.photo.length - 1]
    mediaFileId = largest.file_id
    mediaType = 'photo'
    mediaName = `photo_${msg.message_id}.jpg`
    mediaMime = 'image/jpeg'
  } else if (msg.document) {
    mediaFileId = msg.document.file_id
    mediaType = 'document'
    mediaName = msg.document.file_name || `document_${msg.message_id}`
    mediaMime = msg.document.mime_type || 'application/octet-stream'
  } else if (msg.voice) {
    mediaFileId = msg.voice.file_id
    mediaType = 'voice'
    mediaName = `voice_${msg.message_id}.ogg`
    mediaMime = msg.voice.mime_type || 'audio/ogg'
  } else if (msg.video) {
    mediaFileId = msg.video.file_id
    mediaType = 'video'
    mediaName = `video_${msg.message_id}.mp4`
    mediaMime = msg.video.mime_type || 'video/mp4'
  } else if (msg.audio) {
    mediaFileId = msg.audio.file_id
    mediaType = 'audio'
    mediaName = `audio_${msg.message_id}.mp3`
    mediaMime = msg.audio.mime_type || 'audio/mpeg'
  }

  if (mediaFileId && mediaName && mediaMime) {
    try {
      const { buffer } = await downloadTelegramFile(mediaFileId)
      const path = `${dealId}/${Date.now()}-${mediaName}`
      const { error: uploadErr } = await supabase.storage
        .from('deal-files')
        .upload(path, buffer, { contentType: mediaMime, upsert: false })
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('deal-files').getPublicUrl(path)
        const { data: insertedFile } = await supabase
          .from('deal_files')
          .insert({
            deal_id: dealId,
            name: mediaName,
            url: urlData.publicUrl,
            size: buffer.byteLength,
            mime_type: mediaMime,
            source: 'telegram',
          })
          .select('id')
          .single()
        if (insertedFile) fileId = insertedFile.id
      }
    } catch (e) {
      console.error('[telegram] file save failed:', e)
    }
  }

  // Dedupe by external_id
  const { data: existing } = await supabase
    .from('deal_messages')
    .select('id, file_id')
    .eq('external_id', externalId)
    .maybeSingle()

  const content = msg.text || msg.caption || (mediaType ? `[${mediaType}]` : '')

  if (existing) {
    if (fileId && !existing.file_id) {
      await supabase.from('deal_messages').update({ file_id: fileId, content }).eq('id', existing.id)
    }
  } else {
    await supabase.from('deal_messages').insert({
      deal_id: dealId,
      direction: 'incoming',
      channel: 'telegram',
      sender_name: senderName,
      content,
      file_id: fileId,
      external_id: externalId,
      metadata: {
        tgChatId: chatIdStr,
        tgMessageId: msg.message_id,
        tgUserId: msg.from?.id,
        tgUsername: msg.from?.username,
        chatType: msg.chat.type,
        chatTitle: msg.chat.title,
      },
    })
  }

  // Bump deal updated_at
  await supabase.from('deals').update({ updated_at: new Date().toISOString() }).eq('id', dealId)

  if (!existing) {
    await supabase.from('deal_activities').insert({
      deal_id: dealId,
      activity_type: 'message',
      content: `${isEdited ? 'Изменено' : 'Входящее'} TG (${senderName}): ${content.slice(0, 100)}`,
      metadata: { channel: 'telegram', direction: 'incoming', sender: senderName },
    })
  }
}
