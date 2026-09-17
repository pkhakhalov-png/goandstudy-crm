import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import {
  type TelegramUpdate,
  type TelegramMessage,
  buildSenderName,
  downloadTelegramFile,
} from '@/lib/telegram'
import { normalizePhone } from '@/lib/phone'
import { секретыСовпали, секретГодится } from '@/lib/webhook-secret'
import { warnOnError } from '@/lib/supabase/write-guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Проверка того, что запрос пришёл от Телеграма.
 *
 * До сих пор её не было вовсе: адрес вебхука угадывается с первой попытки, и
 * любой, кто его знает, мог прислать сюда сообщение от имени любого клиента —
 * оно легло бы в чат сделки как настоящее.
 *
 * Включается переменной `TELEGRAM_WEBHOOK_SECRET`, и порядок раскатки
 * принципиален, иначе клиентские чаты замолчат:
 *
 *   1. СНАЧАЛА `npx tsx scripts/telegram-set-webhook.ts` — Телеграм начинает
 *      слать заголовок. Код его пока игнорирует, ничего не меняется.
 *   2. ПОТОМ переменная в окружении — код начинает требовать заголовок,
 *      который уже приходит.
 *
 * Обратный порядок означает промежуток, в котором мы требуем то, чего ещё не
 * шлют, и все сообщения отклоняются.
 *
 * Пока переменная не задана, поведение прежнее. Это не «мягкий режим на
 * всякий случай», а способ выкатить проверку, не останавливая работающее: в
 * логе при каждом запросе стоит напоминание, и молча забыть про него сложно.
 */
export function подписьВерна(req: { headers: { get(name: string): string | null } }): { ok: true } | { ok: false; причина: string } {
  const секрет = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!секрет) {
    console.warn('[telegram webhook] TELEGRAM_WEBHOOK_SECRET не задан — подпись не проверяется, '
      + 'любой знающий адрес может прислать сюда сообщение от имени клиента')
    return { ok: true }
  }
  const годность = секретГодится(секрет)
  if (!годность.ok) {
    // Негодный секрет — это не повод пропускать всех. Пропустить здесь значит
    // не проверять подпись вовсе и думать, что проверяем.
    return { ok: false, причина: `секрет не годится: ${годность.почему}` }
  }
  return секретыСовпали(req.headers.get('x-telegram-bot-api-secret-token'), секрет)
    ? { ok: true }
    : { ok: false, причина: 'заголовок с секретом не сошёлся' }
}

export async function POST(req: NextRequest) {
  const подпись = подписьВерна(req)
  if (!подпись.ok) {
    // Наружу — коротко и без подробностей: тому, кто подбирает секрет, знать
    // причину незачем. Подробность идёт в журнал.
    console.warn(`[telegram webhook] запрос отклонён: ${подпись.причина}`)
    return NextResponse.json({ ok: false }, { status: 401 })
  }

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

  // STEP 2.5: миграция Telegram group → supergroup меняет chat_id (например
  // -5143010936 → -1003944967313). Если в БД уже есть групповая сделка с тем же
  // chat.title, переиспользуем её и обновляем chat_id вместо создания дубля.
  if (!dealId && isGroup && msg.chat.title) {
    const { data: existingByTitle } = await supabase
      .from('deals')
      .select('id, custom_fields')
      .eq('contact_name', msg.chat.title)
      .contains('custom_fields', { is_group: true })
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (existingByTitle) {
      dealId = existingByTitle.id
      // Обновляем chat_id в custom_fields на новый (после миграции в supergroup)
      const oldCustom = (existingByTitle.custom_fields as any) || {}
      await supabase.from('deals').update({
        custom_fields: {
          ...oldCustom,
          group_chat_id: chatIdStr,
          tg_chat_id: msg.chat.id,
          tg_chat_type: msg.chat.type,
          tg_chat_title: msg.chat.title,
          is_group: true,
          previous_chat_id: oldCustom.tg_chat_id || oldCustom.group_chat_id,
        },
      }).eq('id', dealId).then(warnOnError('deals · app/api/telegram/webhook/route.ts:106')).then(warnOnError('deals · перенос chat_id после миграции группы'))
      await supabase.from('deal_activities').insert({
        deal_id: dealId,
        activity_type: 'system',
        content: `Telegram-чат мигрировал в supergroup: ${oldCustom.tg_chat_id || oldCustom.group_chat_id} → ${chatIdStr}`,
      }).then(warnOnError('deal_activities · app/api/telegram/webhook/route.ts:117'))
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
          .eq('id', assignedId).then(warnOnError('users · app/api/telegram/webhook/route.ts:224'))
      }
      await supabase.from('deal_activities').insert({
        deal_id: dealId,
        activity_type: 'system',
        content: isGroup
          ? `Групповой чат «${msg.chat.title}» подключён через Telegram бота`
          : `Личный чат с ${senderName} подключён через Telegram бота`,
      }).then(warnOnError('deal_activities · app/api/telegram/webhook/route.ts:227'))
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
          .single().then(warnOnError('deal_files · app/api/telegram/webhook/route.ts:286'))
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
      await supabase.from('deal_messages').update({ file_id: fileId, content }).eq('id', existing.id).then(warnOnError('deal_messages · app/api/telegram/webhook/route.ts:314'))
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
    }).then(warnOnError('deal_messages · app/api/telegram/webhook/route.ts:317'))
  }

  // Bump deal updated_at
  await supabase.from('deals').update({ updated_at: new Date().toISOString() }).eq('id', dealId).then(warnOnError('deals · app/api/telegram/webhook/route.ts:337'))

  if (!existing) {
    await supabase.from('deal_activities').insert({
      deal_id: dealId,
      activity_type: 'message',
      content: `${isEdited ? 'Изменено' : 'Входящее'} TG (${senderName}): ${content.slice(0, 100)}`,
      metadata: { channel: 'telegram', direction: 'incoming', sender: senderName },
    }).then(warnOnError('deal_activities · app/api/telegram/webhook/route.ts:340'))

    // Auto-create task for incoming messages
    if (!isEdited) {
      const { data: deal } = await supabase.from('deals').select('salesperson_id, contact_name').eq('id', dealId).single()
      if (deal?.salesperson_id) {
        const { data: existingTask } = await supabase
          .from('deal_tasks')
          .select('id')
          .eq('deal_id', dealId)
          .eq('task_type', 'reply')
          .eq('is_done', false)
          .limit(1)
          .maybeSingle()

        if (!existingTask) {
          await supabase.from('deal_tasks').insert({
            deal_id: dealId,
            assigned_to: deal.salesperson_id,
            title: `Клиент написал — необходимо ответить (${deal.contact_name || senderName})`,
            task_type: 'reply',
            deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            is_done: false,
          }).then(warnOnError('deal_tasks · app/api/telegram/webhook/route.ts:361'))
        }
      }
    }
  }

  // ═══ Mirror to client_tg_messages (curator portal) ═══
  if (isGroup && !isEdited) {
    await mirrorToClientChat(supabase, msg, senderName, content)
  }
}

/**
 * Link TG group to client by matching phone numbers in group title,
 * then mirror messages to client_tg_messages for curator portal.
 */
async function mirrorToClientChat(
  supabase: SupabaseAdmin,
  msg: TelegramMessage,
  senderName: string,
  content: string,
) {
  const chatId = msg.chat.id

  // 1. Check if already linked to a client
  const { data: linkedClient } = await supabase
    .from('clients')
    .select('id')
    .eq('tg_group_chat_id', chatId)
    .limit(1)
    .maybeSingle()

  let clientId: number | null = linkedClient?.id ?? null

  // 2. If not linked — try to match by phone in group title
  if (!clientId && msg.chat.title) {
    const title = msg.chat.title
    // Extract all digit sequences that look like phone numbers (7+ digits)
    const phoneMatches = title.match(/[\d\s\-\(\)\+]{7,}/g)
    if (phoneMatches) {
      for (const raw of phoneMatches) {
        const normalized = normalizePhone(raw)
        if (normalized && normalized.length >= 10) {
          const { data: match } = await supabase
            .from('clients')
            .select('id')
            .eq('phone_normalized', normalized)
            .limit(1)
            .maybeSingle()
          if (match) {
            clientId = match.id
            // Link the group to this client
            await supabase.from('clients').update({
              tg_group_chat_id: chatId,
              tg_group_title: title,
            }).eq('id', clientId).then(warnOnError('clients · app/api/telegram/webhook/route.ts:420'))
            console.log(`[telegram] Linked group "${title}" to client ${clientId}`)
            break
          }
        }
      }
    }
  }

  if (!clientId) return

  // 3. Handle file for client_tg_files (separate from deal_files)
  let clientFileId: string | null = null
  const mediaFileId = msg.photo?.[msg.photo.length - 1]?.file_id
    || msg.document?.file_id || msg.voice?.file_id
    || msg.video?.file_id || msg.audio?.file_id || null

  if (mediaFileId) {
    const mediaName = msg.document?.file_name || `file_${msg.message_id}`
    const mediaMime = msg.document?.mime_type || (msg.photo ? 'image/jpeg' : 'application/octet-stream')
    try {
      const { buffer } = await downloadTelegramFile(mediaFileId)
      const path = `client-${clientId}/${Date.now()}-${mediaName}`
      const { error: uploadErr } = await supabase.storage
        .from('deal-files')
        .upload(path, buffer, { contentType: mediaMime, upsert: false })
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('deal-files').getPublicUrl(path)
        const { data: inserted } = await supabase
          .from('client_tg_files')
          .insert({
            client_id: clientId,
            name: mediaName,
            mime_type: mediaMime,
            size: buffer.byteLength,
            url: urlData.publicUrl,
            source: 'telegram',
            uploaded_by: senderName,
          })
          .select('id')
          .single().then(warnOnError('client_tg_files · app/api/telegram/webhook/route.ts:453')).then(warnOnError('client_tg_files · файл из телеграма'))
        if (inserted) clientFileId = inserted.id
      }
    } catch (e) {
      console.error('[telegram] client file save failed:', e)
    }
  }

  // 4. Insert message into client_tg_messages
  await supabase.from('client_tg_messages').insert({
    client_id: clientId,
    tg_message_id: msg.message_id,
    tg_chat_id: chatId,
    direction: 'incoming',
    sender_tg_id: msg.from?.id || null,
    sender_name: senderName,
    sender_role: msg.from?.is_bot ? 'bot' : 'client',
    content: content || null,
    reply_to_tg_id: msg.reply_to_message?.message_id || null,
    file_id: clientFileId,
    metadata: {
      tg_username: msg.from?.username,
      chat_title: msg.chat.title,
    },
    sent_at: new Date(msg.date * 1000).toISOString(),
  }).then(warnOnError('client_tg_messages · app/api/telegram/webhook/route.ts:473'))
}
