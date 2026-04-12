'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { normalizePhone } from '@/lib/phone'
import { sendWazzupMessage, type ChatType } from '@/lib/wazzup'

function reval() {
  revalidatePath('/admin/funnel')
  revalidatePath('/sales/funnel')
}

export async function moveDeal(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const dealId = formData.get('deal_id') as string
  const stageId = formData.get('stage_id') as string
  const oldStageName = formData.get('old_stage_name') as string
  const newStageName = formData.get('new_stage_name') as string

  const { error } = await supabase
    .from('deals')
    .update({ stage_id: stageId, updated_at: new Date().toISOString() })
    .eq('id', dealId)

  if (error) return { error: error.message }

  // Log activity
  await supabase.from('deal_activities').insert({
    deal_id: dealId,
    user_id: user.id,
    activity_type: 'stage_change',
    content: `${oldStageName} → ${newStageName}`,
    metadata: { from_stage: oldStageName, to_stage: newStageName },
  })

  // Auto-link to client when reaching "Договор" stage
  if (newStageName === 'Договор' || newStageName === 'Первичная продажа' || newStageName === 'Оплата услуг') {
    try {
      const { data: deal } = await supabase.from('deals').select('contact_name, contact_phone, contact_telegram, contact_email, salesperson_id, client_id').eq('id', dealId).single()
      if (deal && !deal.client_id) {
        const normalized = normalizePhone(deal.contact_phone)
        const admin = await createAdminClient()
        let clientId: number | null = null

        if (normalized) {
          const { data: existingClient } = await admin.from('clients').select('id').eq('phone_normalized', normalized).limit(1).single()
          if (existingClient) clientId = existingClient.id
        }

        if (!clientId) {
          const { data: newClient } = await admin.from('clients').insert({
            name: deal.contact_name,
            phone: deal.contact_phone,
            telegram: deal.contact_telegram || null,
            email: deal.contact_email || null,
            salesperson_id: deal.salesperson_id,
            status: 'active',
            phone_normalized: normalized,
          }).select('id').single()
          if (newClient) clientId = newClient.id
        }

        if (clientId) {
          await admin.from('deals').update({ client_id: clientId }).eq('id', dealId)
          await admin.from('deal_activities').insert({ deal_id: dealId, user_id: user.id, activity_type: 'system', content: 'Клиент привязан автоматически' })
        }
      }
    } catch {}
  }

  reval()
  return { success: true }
}

export async function createDeal(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const title = (formData.get('title') as string)?.trim()
  const contactName = (formData.get('contact_name') as string)?.trim()
  const contactPhone = (formData.get('contact_phone') as string)?.trim() || null
  const contactTelegram = (formData.get('contact_telegram') as string)?.trim() || null
  const stageId = formData.get('stage_id') as string
  const salespersonId = formData.get('salesperson_id') as string || user.id
  const budget = Number(formData.get('budget') || 0)

  if (!title || !contactName) return { error: 'Заполните название и имя контакта' }

  // Check for duplicate by phone (indexed lookup)
  const normalized = normalizePhone(contactPhone)
  if (normalized) {
    const { data: duplicate } = await supabase
      .from('deals')
      .select('id, contact_telegram, contact_email, contact_whatsapp')
      .eq('phone_normalized', normalized)
      .is('deleted_at', null)
      .limit(1)
      .single()

    if (duplicate) {
      const updates: Record<string, any> = { updated_at: new Date().toISOString() }
      if (!duplicate.contact_telegram && contactTelegram) updates.contact_telegram = contactTelegram
      if (budget > 0) updates.budget = budget
      await supabase.from('deals').update(updates).eq('id', duplicate.id)

      await supabase.from('deal_activities').insert({
        deal_id: duplicate.id,
        user_id: user.id,
        activity_type: 'system',
        content: `Дубль объединён: ${contactName} (${contactPhone})`,
      })

      reval()
      return { success: true, merged: true }
    }
  }

  const { data: deal, error } = await supabase.from('deals').insert({
    title: title,
    stage_id: stageId,
    salesperson_id: salespersonId,
    contact_name: contactName,
    contact_phone: contactPhone,
    contact_telegram: contactTelegram,
    phone_normalized: normalized,
    budget,
    source: 'manual',
  }).select('id').single()

  if (error) return { error: error.message }

  await supabase.from('deal_activities').insert({
    deal_id: deal.id,
    user_id: user.id,
    activity_type: 'system',
    content: 'Сделка создана',
  })

  reval()
  return { success: true }
}

export async function addDealNote(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const dealId = formData.get('deal_id') as string
  const content = (formData.get('content') as string)?.trim()

  if (!content) return { error: 'Введите текст заметки' }

  await supabase.from('deal_activities').insert({
    deal_id: dealId,
    user_id: user.id,
    activity_type: 'note',
    content,
  })

  await supabase.from('deals').update({ updated_at: new Date().toISOString() }).eq('id', dealId)

  reval()
  return { success: true }
}

export async function updateStage(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const stageId = formData.get('stage_id') as string
  const name = formData.get('name') as string | null
  const color = formData.get('color') as string | null
  const value = formData.get('value') as string | null

  const updates: Record<string, string | number> = {}
  if (name) updates.name = name.trim()
  if (color) updates.color = color
  if (value !== null) updates.value = Number(value)

  const { error } = await supabase.from('pipeline_stages').update(updates).eq('id', stageId)
  if (error) return { error: error.message }

  reval()
  return { success: true }
}

export async function updateDeal(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const dealId = formData.get('deal_id') as string
  const updates: Record<string, any> = { updated_at: new Date().toISOString() }

  const fields = ['contact_name', 'contact_phone', 'contact_telegram', 'contact_email', 'contact_whatsapp', 'budget', 'title', 'salesperson_id']
  fields.forEach(f => {
    const val = formData.get(f)
    if (val !== null) updates[f] = f === 'budget' ? Number(val) : (val as string).trim() || null
  })

  const { error } = await supabase.from('deals').update(updates).eq('id', dealId)
  if (error) return { error: error.message }

  reval()
  return { success: true }
}

// ═══ SOFT DELETE / TRASH ═══

export async function softDeleteDeal(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const dealId = formData.get('deal_id') as string
  await supabase.from('deals').update({ deleted_at: new Date().toISOString() }).eq('id', dealId)
  reval()
  return { success: true }
}

export async function restoreDeal(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const dealId = formData.get('deal_id') as string
  await supabase.from('deals').update({ deleted_at: null }).eq('id', dealId)
  reval()
  return { success: true }
}

export async function permanentDeleteDeal(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const dealId = formData.get('deal_id') as string
  await supabase.from('deals').delete().eq('id', dealId)
  reval()
  return { success: true }
}

// ═══ BULK ACTIONS ═══

export async function bulkMoveDeals(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const dealIds: string[] = JSON.parse(formData.get('deal_ids') as string)
  const stageId = formData.get('stage_id') as string

  await supabase.from('deals').update({ stage_id: stageId, updated_at: new Date().toISOString() }).in('id', dealIds)
  reval()
  return { success: true }
}

export async function bulkDeleteDeals(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const dealIds: string[] = JSON.parse(formData.get('deal_ids') as string)
  await supabase.from('deals').update({ deleted_at: new Date().toISOString() }).in('id', dealIds)
  reval()
  return { success: true }
}

// ═══ STAGE MANAGEMENT ═══

export async function addStage(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const name = (formData.get('name') as string)?.trim()
  if (!name) return { error: 'Укажите название' }

  const insertAt = formData.get('position') ? Number(formData.get('position')) : null

  if (insertAt !== null) {
    // Shift all stages at this position and above
    const { data: toShift } = await supabase.from('pipeline_stages').select('id, position').gte('position', insertAt).order('position', { ascending: false })
    if (toShift) {
      for (const s of toShift) {
        await supabase.from('pipeline_stages').update({ position: s.position + 1 }).eq('id', s.id)
      }
    }
    await supabase.from('pipeline_stages').insert({ name, color: '#B15ECC', position: insertAt, stage_type: 'active', is_active: true })
  } else {
    const { data: maxPos } = await supabase.from('pipeline_stages').select('position').order('position', { ascending: false }).limit(1).single()
    const position = (maxPos?.position ?? 0) + 1
    await supabase.from('pipeline_stages').insert({ name, color: '#B15ECC', position, stage_type: 'active', is_active: true })
  }

  reval()
  return { success: true }
}

export async function removeStage(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const stageId = formData.get('stage_id') as string
  const { data: dealsInStage } = await supabase.from('deals').select('id').eq('stage_id', stageId).is('deleted_at', null).limit(1)
  if (dealsInStage && dealsInStage.length > 0) return { error: 'Нельзя удалить этап с активными сделками' }

  await supabase.from('pipeline_stages').update({ is_active: false }).eq('id', stageId)
  reval()
  return { success: true }
}

// ═══ DEAL TASKS ═══

export async function createDealTask(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const dealId = formData.get('deal_id') as string
  const title = (formData.get('title') as string)?.trim()
  const deadline = formData.get('deadline') as string || null
  const assignedTo = formData.get('assigned_to') as string || user.id

  if (!title) return { error: 'Укажите задачу' }

  await supabase.from('deal_tasks').insert({
    deal_id: dealId, title, deadline, assigned_to: assignedTo, created_by: user.id,
  })

  await supabase.from('deal_activities').insert({
    deal_id: dealId, user_id: user.id, activity_type: 'system', content: `Задача: ${title}`,
  })

  reval()
  revalidatePath(`/admin/funnel/${dealId}`)
  return { success: true }
}

export async function toggleDealTask(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const taskId = formData.get('task_id') as string
  const isDone = formData.get('is_done') === 'true'

  await supabase.from('deal_tasks').update({
    is_done: !isDone,
    completed_at: !isDone ? new Date().toISOString() : null,
  }).eq('id', taskId)

  reval()
  return { success: true }
}

export async function deleteDealTask(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const taskId = formData.get('task_id') as string
  await supabase.from('deal_tasks').delete().eq('id', taskId)
  reval()
  return { success: true }
}

// ═══ LINK DEAL TO CLIENT ═══

export async function linkDealToClient(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const dealId = formData.get('deal_id') as string
  const clientId = formData.get('client_id') as string

  await supabase.from('deals').update({ client_id: clientId ? Number(clientId) : null, updated_at: new Date().toISOString() }).eq('id', dealId)

  if (clientId) {
    await supabase.from('deal_activities').insert({ deal_id: dealId, user_id: user.id, activity_type: 'system', content: 'Клиент привязан вручную' })
  }

  reval()
  revalidatePath(`/admin/funnel/${dealId}`)
  return { success: true }
}

// ═══ WAZZUP SEND ═══

export async function sendDealMessage(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const dealId = formData.get('deal_id') as string
  const text = (formData.get('text') as string)?.trim()
  const channel = formData.get('channel') as 'telegram' | 'whatsapp'

  if (!text) return { error: 'Введите сообщение' }
  if (!channel) return { error: 'Выберите канал' }

  const { data: deal } = await supabase
    .from('deals')
    .select('id, contact_phone, contact_telegram, phone_normalized')
    .eq('id', dealId)
    .single()

  if (!deal) return { error: 'Сделка не найдена' }

  // Determine channelId and chatId (trim to strip accidental whitespace)
  const rawChannelId = channel === 'telegram'
    ? process.env.WAZZUP_TG_CHANNEL_ID
    : process.env.WAZZUP_WA_CHANNEL_ID

  const channelId = (rawChannelId ?? '').trim()

  // Debug log — available in Vercel function logs
  console.log('[sendDealMessage] channel:', channel, 'channelId len:', channelId.length, 'channelId:', JSON.stringify(channelId))

  if (!channelId) return { error: `Канал ${channel} не настроен (env ${channel === 'telegram' ? 'WAZZUP_TG_CHANNEL_ID' : 'WAZZUP_WA_CHANNEL_ID'} пуст)` }

  let chatType: ChatType
  let chatId: string

  if (channel === 'whatsapp') {
    if (!deal.phone_normalized) return { error: 'У клиента нет телефона' }
    chatType = 'whatsapp'
    chatId = deal.phone_normalized
  } else {
    // Wazzup v3: for tgapi channels, chatType is "telegram"
    // chatId = phone (without +) or @username
    const handle = deal.phone_normalized || deal.contact_telegram?.replace(/^@/, '')
    if (!handle) return { error: 'У клиента нет Telegram или телефона' }
    chatType = 'telegram'
    chatId = handle
  }

  try {
    const result = await sendWazzupMessage({ channelId, chatType, chatId, text })

    // Save to deal_messages immediately (webhook will also fire as echo, but this is instant)
    await supabase.from('deal_messages').insert({
      deal_id: dealId,
      direction: 'outgoing',
      channel,
      sender_name: 'Менеджер',
      content: text,
      external_id: result.messageId,
      metadata: { channelId, chatId, sentBy: user.id },
    })

    await supabase.from('deal_activities').insert({
      deal_id: dealId,
      user_id: user.id,
      activity_type: 'message',
      content: `Исходящее ${channel}: ${text.slice(0, 100)}`,
      metadata: { channel, direction: 'outgoing' },
    })

    await supabase.from('deals').update({ updated_at: new Date().toISOString() }).eq('id', dealId)

    revalidatePath(`/admin/funnel/${dealId}`)
    revalidatePath(`/sales/funnel/${dealId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Ошибка отправки' }
  }
}

export async function searchClients(query: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('clients').select('id, name, phone, country').or(`name.ilike.%${query}%,phone.ilike.%${query}%`).limit(10)
  return data ?? []
}

// ═══ DUPLICATE DETECTION ═══

export async function findDuplicates() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован', groups: [] }

  const { data, error } = await supabase.rpc('find_duplicate_deals')
  if (error) return { error: error.message, groups: [] }

  // Fetch full deal info for each group
  const allIds = (data ?? []).flatMap((g: any) => g.deal_ids)
  if (allIds.length === 0) return { groups: [] }

  const { data: deals } = await supabase
    .from('deals')
    .select('id, title, contact_name, contact_phone, contact_telegram, contact_email, budget, stage_id, source, created_at')
    .in('id', allIds)

  const dealMap = new Map((deals ?? []).map(d => [d.id, d]))

  const groups = (data ?? []).map((g: any) => ({
    phone: g.phone,
    count: Number(g.deal_count),
    deals: g.deal_ids.map((id: string) => dealMap.get(id)).filter(Boolean),
  }))

  return { groups }
}

// ═══ PAGINATION ═══

const DEALS_PER_PAGE = 50

export async function loadMoreDeals(stageId: string, offset: number, salespersonId?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { deals: [], hasMore: false }

  let query = supabase
    .from('deals')
    .select('id, title, stage_id, salesperson_id, contact_name, contact_phone, contact_telegram, contact_email, contact_whatsapp, budget, source, created_at, updated_at')
    .eq('stage_id', stageId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .range(offset, offset + DEALS_PER_PAGE - 1)

  if (salespersonId) query = query.eq('salesperson_id', salespersonId)

  const { data } = await query
  return {
    deals: data ?? [],
    hasMore: (data?.length ?? 0) === DEALS_PER_PAGE,
  }
}

export async function mergeDeals(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const keepId = formData.get('keep_id') as string
  const removeIds: string[] = JSON.parse(formData.get('remove_ids') as string)

  const { error } = await supabase.rpc('merge_deals', { keep_id: keepId, remove_ids: removeIds })
  if (error) return { error: error.message }

  reval()
  return { success: true }
}
