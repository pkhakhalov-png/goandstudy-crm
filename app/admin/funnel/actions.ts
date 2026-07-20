'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { normalizePhone } from '@/lib/phone'
import { sendWazzupMessage, getTgapiChannelId, type ChatType } from '@/lib/wazzup'
import { sendTelegramMessage } from '@/lib/telegram'
import { suggestSalesReply } from '@/lib/ai'
import { createClientInvitation } from '@/lib/invitation'

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
  const lostReason = (formData.get('lost_reason') as string | null)?.trim() || null

  const updatePayload: Record<string, unknown> = {
    stage_id: stageId,
    updated_at: new Date().toISOString(),
  }
  if (lostReason) updatePayload.lost_reason = lostReason

  const { error } = await supabase
    .from('deals')
    .update(updatePayload)
    .eq('id', dealId)

  if (error) return { error: error.message }

  // Log activity — stage move
  await supabase.from('deal_activities').insert({
    deal_id: dealId,
    user_id: user.id,
    activity_type: 'stage_change',
    content: `${oldStageName} → ${newStageName}`,
    metadata: { from_stage: oldStageName, to_stage: newStageName },
  })

  // Отдельная запись с основанием — отображается в истории как комментарий менеджера
  if (lostReason) {
    await supabase.from('deal_activities').insert({
      deal_id: dealId,
      user_id: user.id,
      activity_type: 'note',
      content: `Основание «НЕ ЦЕЛЕВЫЕ»: ${lostReason}`,
      metadata: { reason: lostReason, stage: newStageName },
    })
  }

  // Auto-link to client when reaching payment stages
  if (newStageName === 'Договор' || newStageName === 'Первичная продажа' || newStageName === 'Оплата услуг') {
    try {
      const { data: deal } = await supabase.from('deals').select('contact_name, contact_phone, contact_telegram, contact_email, salesperson_id, client_id, budget').eq('id', dealId).single()
      if (deal) {
        const normalized = normalizePhone(deal.contact_phone)
        const admin = await createAdminClient()
        let clientId: number | null = deal.client_id ? Number(deal.client_id) : null

        // Onboarding data from modal
        const curatorId = formData.get('curator_id') as string || null
        const totalAmount = Number(formData.get('total_amount')) || Number(deal.budget) || 0
        const months = Number(formData.get('months')) || 6
        const firstPayDate = (formData.get('first_pay_date') as string) || new Date().toISOString().split('T')[0]
        const groupChatId = formData.get('group_chat_id') as string || null

        if (normalized) {
          const { data: existingClient } = await admin.from('clients').select('id').eq('phone_normalized', normalized).limit(1).single()
          if (existingClient) clientId = existingClient.id
        }

        if (!clientId) {
          // No existing client — create new one
          if (totalAmount > 0 && months > 0) {
            const { error: rpcErr } = await admin.rpc('create_client_with_payments', {
              p_name: deal.contact_name,
              p_phone: deal.contact_phone,
              p_email: deal.contact_email || null,
              p_telegram: deal.contact_telegram || null,
              p_country: null,
              p_university: null,
              p_total_amount: totalAmount,
              p_months: months,
              p_first_pay_date: firstPayDate,
              p_curator_id: curatorId,
              p_salesperson_id: deal.salesperson_id,
              p_notes: null,
            })
            if (rpcErr) console.error('[moveDeal] RPC error:', rpcErr.message)

            const { data: created } = await admin.from('clients')
              .select('id')
              .eq('name', deal.contact_name)
              .order('created_at', { ascending: false })
              .limit(1)
              .single()
            if (created) clientId = created.id

            if (clientId && normalized) {
              await admin.from('clients').update({ phone_normalized: normalized }).eq('id', clientId).is('phone_normalized', null)
            }
          } else {
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
        } else if (totalAmount > 0 && months > 0) {
          // Client exists but may be missing payments — check and create
          const { data: existingPayments } = await admin.from('payments').select('id').eq('client_id', clientId).limit(1)
          if (!existingPayments || existingPayments.length === 0) {
            // Create payments for existing client
            const perMonth = Math.round((totalAmount / months) * 100) / 100
            const lastMonth = Math.round((totalAmount - perMonth * (months - 1)) * 100) / 100
            const paymentRows = []
            for (let i = 0; i < months; i++) {
              const date = new Date(firstPayDate)
              date.setMonth(date.getMonth() + i)
              paymentRows.push({
                client_id: clientId,
                num: i + 1,
                plan_date: date.toISOString().split('T')[0],
                plan_sum: i === months - 1 ? lastMonth : perMonth,
                fact_sum: 0,
                is_paid: false,
              })
            }
            await admin.from('payments').insert(paymentRows)

            // Update client months and first_payment_date.
            // 4+ month installments accrue salesperson commission per received
            // payment (via the sync_sales_commission trigger), so flag them.
            const perPayment = months >= 4
            await admin.from('clients').update({
              months,
              first_payment_date: firstPayDate,
              commission_per_payment: perPayment,
            }).eq('id', clientId)

            // Create expenses (same as RPC does)
            const { data: existingExpenses } = await admin.from('expenses').select('id').eq('client_id', clientId!).limit(1)
            if (!existingExpenses || existingExpenses.length === 0) {
              const { data: sp } = deal.salesperson_id
                ? await admin.from('users').select('name').eq('id', deal.salesperson_id).maybeSingle()
                : { data: null }
              const expenseRows: Record<string, unknown>[] = [
                { client_id: clientId, article: 'curator', plan_date: firstPayDate, plan_sum: 25000, note: 'Куратор — этап 1' },
                { client_id: clientId, article: 'curator', plan_date: (() => { const d = new Date(firstPayDate); d.setMonth(d.getMonth() + 1); return d.toISOString().split('T')[0] })(), plan_sum: 25000, note: 'Куратор — этап 2' },
              ]
              // Salesperson lump only for <= 3 month installments; per-payment
              // commission for 4+ months is booked by the DB trigger.
              if (!perPayment) {
                expenseRows.push({ client_id: clientId, article: 'salesperson', who: sp?.name ?? null, plan_date: firstPayDate, plan_sum: Math.round(totalAmount * 0.1), note: 'ЗП продажника — 10% от ' + totalAmount.toLocaleString('ru') + ' ₽' })
              }
              await admin.from('expenses').insert(expenseRows)
            }
          }
        }

        if (clientId) {
          await admin.from('deals').update({ client_id: clientId }).eq('id', dealId)

          // Set curator and initial stage if provided
          if (curatorId) {
            await admin.from('clients').update({
              curator_id: curatorId,
              curator_assigned_at: new Date().toISOString(),
              current_stage_code: 'strategy_session',
            }).eq('id', clientId)
          }

          // Link TG group
          if (groupChatId) {
            const groupTitle = formData.get('group_title') as string || null
            // Find title from deal's custom_fields
            const { data: groupDeal } = await admin.from('deals').select('custom_fields').eq('custom_fields->>group_chat_id', groupChatId).limit(1).maybeSingle()
            await admin.from('clients').update({
              tg_group_chat_id: Number(groupChatId),
              tg_group_title: groupTitle || groupDeal?.custom_fields?.tg_chat_title || 'Группа',
            }).eq('id', clientId)
          }

          await admin.from('deal_activities').insert({ deal_id: dealId, user_id: user.id, activity_type: 'system', content: 'Клиент оформлен' })

          // Генерируем invite-ссылку для клиента (если есть email).
          // Если ссылка уже была — createClientInvitation вернёт существующую.
          try {
            const invite = await createClientInvitation(clientId, user.id)
            if (invite.ok) {
              reval()
              return { success: true, clientId, inviteUrl: invite.url, emailSent: invite.emailSent }
            }
          } catch (e) {
            console.error('[moveDeal] invite generation error:', e)
          }
        }
      }
    } catch (e) {
      console.error('[moveDeal] onboarding error:', e)
    }
  }

  reval()
  return { success: true }
}

export async function createDeal(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const contactName = (formData.get('contact_name') as string)?.trim()
  const titleRaw = (formData.get('title') as string)?.trim()
  const title = titleRaw || contactName  // fallback: title = ФИО
  const contactPhone = (formData.get('contact_phone') as string)?.trim() || null
  const contactEmail = (formData.get('contact_email') as string)?.trim() || null
  const contactTelegram = (formData.get('contact_telegram') as string)?.trim() || null
  const stageId = formData.get('stage_id') as string
  const salespersonId = formData.get('salesperson_id') as string || user.id
  const budget = Number(formData.get('budget') || 0)

  if (!contactName) return { error: 'Заполните ФИО клиента' }

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
    contact_email: contactEmail,
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

  // Save consultation_notes to custom_fields
  const consultationNotes = formData.get('consultation_notes') as string | null
  if (consultationNotes !== null) {
    const { data: currentDeal } = await supabase.from('deals').select('custom_fields').eq('id', dealId).single()
    updates.custom_fields = { ...(currentDeal?.custom_fields || {}), consultation_notes: consultationNotes }
  }

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

export async function emptyTrash() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  await supabase.from('deals').delete().not('deleted_at', 'is', null)
  reval()
  return { success: true }
}

export async function autoCleanTrash() {
  const supabase = await createAdminClient()
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  await supabase.from('deals').delete().not('deleted_at', 'is', null).lt('deleted_at', weekAgo)
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
    .select('id, source, custom_fields, contact_phone, contact_telegram, phone_normalized')
    .eq('id', dealId)
    .single()

  if (!deal) return { error: 'Сделка не найдена' }

  const isGroupDeal = deal.source === 'telegram_group_bot' || deal.custom_fields?.is_group === true

  // Telegram group deals go through the direct Bot API — Wazzup tgapi cannot
  // deliver to Telegram groups/supergroups without explicit Wazzup support
  // activation. The message will appear as coming from the bot, which is the
  // accepted trade-off. Personal TG chats still go through Wazzup tgapi so
  // they come from the real account.
  if (channel === 'telegram' && isGroupDeal) {
    const groupChatId = deal.custom_fields?.group_chat_id
      ?? deal.custom_fields?.tg_chat_id
      ?? deal.custom_fields?.wazzup_chat_id
    if (!groupChatId) return { error: 'Не найден chat_id группы в custom_fields' }

    try {
      const tgRes = await sendTelegramMessage(groupChatId, text) as { result?: { message_id?: number } }
      const messageId = `tg_${groupChatId}_${tgRes?.result?.message_id ?? Date.now()}`

      const { data: existing } = await supabase
        .from('deal_messages')
        .select('id')
        .eq('external_id', messageId)
        .maybeSingle()

      if (!existing) {
        await supabase.from('deal_messages').insert({
          deal_id: dealId,
          direction: 'outgoing',
          channel: 'telegram',
          sender_name: 'Менеджер',
          content: text,
          external_id: messageId,
          metadata: { tgChatId: String(groupChatId), sentBy: user.id, viaBotApi: true },
        })
      }

      await supabase.from('deal_activities').insert({
        deal_id: dealId,
        user_id: user.id,
        activity_type: 'message',
        content: `Исходящее telegram (group): ${text.slice(0, 100)}`,
        metadata: { channel: 'telegram', direction: 'outgoing' },
      })

      await supabase.from('deals').update({ updated_at: new Date().toISOString() }).eq('id', dealId)
      revalidatePath(`/admin/funnel/${dealId}`)
      revalidatePath(`/sales/funnel/${dealId}`)
      return { success: true }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Ошибка отправки в TG-группу' }
    }
  }

  // Personal TG → Wazzup tgapi (real account). WA → Wazzup wa channel.
  let channelId: string
  if (channel === 'telegram') {
    try {
      channelId = await getTgapiChannelId()
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Не удалось получить tgapi-канал' }
    }
  } else {
    channelId = (process.env.WAZZUP_WA_CHANNEL_ID ?? '').trim()
    if (!channelId) return { error: 'Канал whatsapp не настроен (env WAZZUP_WA_CHANNEL_ID пуст)' }
  }

  let chatType: ChatType
  let chatId: string

  // Try to find chatId from last incoming message for this channel (most reliable)
  const { data: lastIncoming } = await supabase
    .from('deal_messages')
    .select('metadata')
    .eq('deal_id', dealId)
    .eq('channel', channel)
    .eq('direction', 'incoming')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const knownChatId = lastIncoming?.metadata?.chatId as string | undefined

  if (channel === 'whatsapp') {
    chatType = 'whatsapp'
    chatId = knownChatId || deal.phone_normalized
    if (!chatId) return { error: 'У клиента нет телефона' }
  } else {
    // Wazzup send API expects chatType='telegram' for sending from a tgapi
    // (personal-account) channel — 'tgapi' is the channel transport, not the
    // send-side chat type. Channel selection already routes through the tgapi
    // channelId, so the message comes from the real account, not the bot.
    chatType = 'telegram'
    const groupChatId = isGroupDeal
      ? (deal.custom_fields?.group_chat_id ?? deal.custom_fields?.tg_chat_id ?? deal.custom_fields?.wazzup_chat_id)
      : null
    chatId = groupChatId
      || knownChatId
      || deal.contact_telegram?.replace(/^@/, '')
      || deal.phone_normalized
    if (!chatId) return { error: 'У клиента нет Telegram или телефона' }
  }

  try {
    const result = await sendWazzupMessage({ channelId, chatType, chatId, text })

    // Check if webhook echo already saved this messageId, otherwise insert
    const { data: existing } = await supabase
      .from('deal_messages')
      .select('id')
      .eq('external_id', result.messageId)
      .maybeSingle()

    if (!existing) {
      await supabase.from('deal_messages').insert({
        deal_id: dealId,
        direction: 'outgoing',
        channel,
        sender_name: 'Менеджер',
        content: text,
        external_id: result.messageId,
        metadata: { channelId, chatId, sentBy: user.id },
      })
    }

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

export async function sendDealFile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const dealId = formData.get('deal_id') as string
  const channel = formData.get('channel') as 'telegram' | 'whatsapp'
  const file = formData.get('file') as File | null
  const caption = ((formData.get('caption') as string) || '').trim()

  if (!file) return { error: 'Файл не выбран' }
  if (!channel) return { error: 'Выберите канал' }

  const channelIdRaw = channel === 'telegram' ? process.env.WAZZUP_TG_CHANNEL_ID : process.env.WAZZUP_WA_CHANNEL_ID
  const channelId = (channelIdRaw ?? '').trim()
  if (!channelId) return { error: `Канал ${channel} не настроен` }

  // Find existing chatId from incoming messages (most reliable)
  const { data: lastIncoming } = await supabase
    .from('deal_messages')
    .select('metadata')
    .eq('deal_id', dealId)
    .eq('channel', channel)
    .eq('direction', 'incoming')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const knownChatId = lastIncoming?.metadata?.chatId as string | undefined

  const { data: deal } = await supabase
    .from('deals')
    .select('id, contact_phone, contact_telegram, phone_normalized')
    .eq('id', dealId)
    .single()

  if (!deal) return { error: 'Сделка не найдена' }

  const chatType: 'telegram' | 'whatsapp' = channel
  const chatId = knownChatId ?? (channel === 'whatsapp'
    ? deal.phone_normalized
    : deal.contact_telegram?.replace(/^@/, '') || deal.phone_normalized)
  if (!chatId) return { error: 'Нет идентификатора чата' }

  // Upload file to Supabase Storage (path WITHOUT duplicate "deal-files" prefix)
  const admin = await createAdminClient()
  const buffer = await file.arrayBuffer()
  const safeName = file.name.replace(/[^\w.\-]/g, '_')
  const storagePath = `${dealId}/${Date.now()}-${safeName}`

  const { error: uploadErr } = await admin.storage
    .from('deal-files')
    .upload(storagePath, buffer, { contentType: file.type || 'application/octet-stream', upsert: false })

  if (uploadErr) return { error: `Загрузка в Storage: ${uploadErr.message}` }

  const { data: urlData } = admin.storage.from('deal-files').getPublicUrl(storagePath)
  const publicUrl = urlData.publicUrl
  console.log('[sendDealFile] uploaded:', publicUrl, 'mime:', file.type, 'size:', file.size)

  // Save file record
  const { data: insertedFile } = await admin
    .from('deal_files')
    .insert({
      deal_id: dealId,
      name: file.name,
      url: publicUrl,
      size: file.size,
      mime_type: file.type || 'application/octet-stream',
      source: 'upload',
      uploaded_by: user.id,
    })
    .select('id')
    .single()

  try {
    const result = await sendWazzupMessage({
      channelId,
      chatType,
      chatId,
      contentUri: publicUrl,
      text: caption || undefined,
    })

    const { data: existingMsg } = await supabase
      .from('deal_messages')
      .select('id')
      .eq('external_id', result.messageId)
      .maybeSingle()

    if (!existingMsg) {
      await supabase.from('deal_messages').insert({
        deal_id: dealId,
        direction: 'outgoing',
        channel,
        sender_name: 'Менеджер',
        content: caption || `[${file.type.startsWith('image/') ? 'image' : 'file'}]`,
        file_id: insertedFile?.id ?? null,
        external_id: result.messageId,
        metadata: { channelId, chatId, sentBy: user.id },
      })
    }

    await supabase.from('deal_activities').insert({
      deal_id: dealId,
      user_id: user.id,
      activity_type: 'file_upload',
      content: `Отправлен файл: ${file.name}`,
      metadata: { channel, direction: 'outgoing', fileName: file.name },
    })

    await supabase.from('deals').update({ updated_at: new Date().toISOString() }).eq('id', dealId)

    revalidatePath(`/admin/funnel/${dealId}`)
    revalidatePath(`/sales/funnel/${dealId}`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Ошибка отправки файла' }
  }
}

// ═══ AI SALES ASSISTANT ═══

export async function suggestReply(dealId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  // Load deal with stage name
  const { data: deal } = await supabase
    .from('deals')
    .select('id, title, contact_name, contact_phone, contact_telegram, budget, source, created_at, stage_id, client_id')
    .eq('id', dealId)
    .single()

  if (!deal) return { error: 'Сделка не найдена' }

  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('name')
    .eq('id', deal.stage_id)
    .single()

  // Load last 40 messages
  const { data: messages } = await supabase
    .from('deal_messages')
    .select('direction, sender_name, content, created_at')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: true })
    .limit(40)

  // Optional: linked client info
  let extraContext = ''
  if (deal.client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('name, country, university, status, months')
      .eq('id', deal.client_id)
      .single()
    if (client) {
      extraContext = `Привязанный клиент: ${client.name}, страна: ${client.country || '—'}, вуз: ${client.university || '—'}, статус: ${client.status || '—'}`
    }
  }

  try {
    const suggestion = await suggestSalesReply(
      {
        title: deal.title,
        stage_name: stage?.name,
        contact_name: deal.contact_name,
        contact_phone: deal.contact_phone,
        contact_telegram: deal.contact_telegram,
        budget: Number(deal.budget || 0),
        source: deal.source || 'manual',
        created_at: deal.created_at,
      },
      (messages ?? []).map(m => ({
        direction: m.direction as 'incoming' | 'outgoing',
        sender_name: m.sender_name,
        content: m.content,
        created_at: m.created_at,
      })),
      extraContext || undefined,
    )

    return { suggestion }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Ошибка AI' }
  }
}

export async function searchClients(query: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('clients').select('id, name, phone, country, curator_id, tg_group_chat_id, tg_group_title, status').or(`name.ilike.%${query}%,phone.ilike.%${query}%`).limit(10)
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
