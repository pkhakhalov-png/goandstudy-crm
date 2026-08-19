'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, error: 'Не авторизован' as const }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { supabase, error: 'Только админ' as const }
  return { supabase, error: null }
}

export async function updatePaymentSum(paymentId: number, newSum: number) {
  const { supabase, error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  if (!(newSum >= 0)) return { error: 'Сумма должна быть ≥ 0' }

  // Look up the edited payment and its client
  const { data: edited } = await supabase
    .from('payments')
    .select('id, client_id, plan_sum')
    .eq('id', paymentId)
    .single()
  if (!edited) return { error: 'Платёж не найден' }

  // Fetch all payments for this client — keep the contract total fixed and
  // redistribute the delta across the OTHER unpaid payments proportionally.
  const { data: all } = await supabase
    .from('payments')
    .select('id, plan_sum, fact_sum, is_paid, plan_date')
    .eq('client_id', edited.client_id)
    .order('plan_date', { ascending: true })
  if (!all || all.length === 0) return { error: 'Нет платежей у клиента' }

  const totalBefore = all.reduce((s, p) => s + Number(p.plan_sum), 0)
  const otherUnpaid = all.filter(p => p.id !== paymentId && !p.is_paid)
  const otherPaidSum = all
    .filter(p => p.id !== paymentId && p.is_paid)
    .reduce((s, p) => s + Number(p.plan_sum), 0)

  // Sum that must be covered by the other unpaid payments to keep total fixed
  const remainingForUnpaid = totalBefore - newSum - otherPaidSum

  if (otherUnpaid.length === 0) {
    // Nothing to rebalance into — just update the edited one
    const { error } = await supabase.from('payments').update({ plan_sum: newSum }).eq('id', paymentId)
    if (error) return { error: error.message }
    revalidatePath('/admin/clients')
    return { success: true }
  }

  if (remainingForUnpaid < 0) {
    return { error: `Новое значение превышает доступный остаток (других неоплаченных ${otherUnpaid.length}, им нечего распределить)` }
  }

  const per = Math.round((remainingForUnpaid / otherUnpaid.length) * 100) / 100
  const last = Math.round((remainingForUnpaid - per * (otherUnpaid.length - 1)) * 100) / 100

  // Update the edited payment first
  {
    const { error } = await supabase.from('payments').update({ plan_sum: newSum }).eq('id', paymentId)
    if (error) return { error: error.message }
  }

  // Redistribute into the other unpaid ones
  for (let i = 0; i < otherUnpaid.length; i++) {
    const sum = i === otherUnpaid.length - 1 ? last : per
    const { error } = await supabase
      .from('payments')
      .update({ plan_sum: sum })
      .eq('id', otherUnpaid[i].id)
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/clients')
  return { success: true }
}

export async function updateClientTotal(clientId: number, newTotal: number) {
  const { supabase, error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  if (!(newTotal >= 0)) return { error: 'Сумма должна быть ≥ 0' }

  // Pull all payments for the client
  const { data: payments } = await supabase
    .from('payments')
    .select('id, plan_sum, fact_sum, is_paid, plan_date')
    .eq('client_id', clientId)
    .order('plan_date', { ascending: true })

  if (!payments || payments.length === 0) return { error: 'У клиента нет платежей' }

  // Use real-world amounts when a payment is marked paid — fact_sum has priority
  // over plan_sum so the remainder to distribute reflects what actually came in.
  const paidSum = payments
    .filter(p => p.is_paid)
    .reduce((s, p) => s + Number(p.fact_sum ?? p.plan_sum), 0)

  const remaining = newTotal - paidSum
  if (remaining < 0) return { error: `Новая сумма меньше уже оплаченного (${paidSum} ₽)` }

  const unpaid = payments.filter(p => !p.is_paid)
  if (unpaid.length === 0) {
    return { error: 'Все платежи уже оплачены — нечего пересчитывать' }
  }

  const per = Math.round((remaining / unpaid.length) * 100) / 100
  const last = Math.round((remaining - per * (unpaid.length - 1)) * 100) / 100

  // Update each unpaid payment
  for (let i = 0; i < unpaid.length; i++) {
    const sum = i === unpaid.length - 1 ? last : per
    const { error } = await supabase
      .from('payments')
      .update({ plan_sum: sum })
      .eq('id', unpaid[i].id)
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/clients')
  return { success: true }
}

export async function updateExpectedOfferMonth(clientId: number, month: string) {
  const { supabase, error } = await assertAdmin()
  if (error) return { error }

  const value = month?.trim() || null
  if (value && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return { error: 'Некорректный месяц' }

  const { error: updErr } = await supabase
    .from('clients')
    .update({ expected_offer_month: value })
    .eq('id', clientId)
  if (updErr) return { error: updErr.message }

  revalidatePath('/admin/clients')
  revalidatePath('/sales')
  revalidatePath(`/curator/clients/${clientId}`)
  return { success: true }
}

export async function assignCurator(clientId: number, curatorId: string) {
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('curator_id')
    .eq('id', clientId)
    .single()

  if (!client) return { error: 'Клиент не найден' }
  if (client.curator_id) return { error: 'Куратор уже назначен' }

  const { data: curator } = await supabase
    .from('curators')
    .select('id, name')
    .eq('id', curatorId)
    .single()

  if (!curator) return { error: 'Куратор не найден' }

  const { error: updateErr } = await supabase
    .from('clients')
    .update({
      curator_id: curator.id,
      curator_assigned_at: new Date().toISOString(),
      current_stage_code: 'strategy_session',
    })
    .eq('id', clientId)
    .is('curator_id', null)

  if (updateErr) return { error: updateErr.message }

  await supabase
    .from('expenses')
    .update({ who: curator.name })
    .eq('client_id', clientId)
    .eq('article', 'curator')
    .or('who.is.null,who.eq.')

  revalidatePath('/admin/clients')
  revalidatePath('/admin/expenses')
  revalidatePath('/curator')
  revalidatePath('/curator/clients')
  return { success: true }
}

export async function getAvailableGroups() {
  const { error: authErr } = await assertAdmin()
  if (authErr) return []

  const admin = await createAdminClient()

  // Get all group chats from deals
  const { data: deals } = await admin
    .from('deals')
    .select('id, title, custom_fields')
    .not('custom_fields->>group_chat_id', 'is', null)
    .is('deleted_at', null)

  // Get already linked client groups
  const { data: linkedClients } = await admin
    .from('clients')
    .select('tg_group_chat_id')
    .not('tg_group_chat_id', 'is', null)

  const linkedSet = new Set((linkedClients ?? []).map(c => String(c.tg_group_chat_id)))

  return (deals ?? []).map(d => ({
    chat_id: d.custom_fields?.group_chat_id || d.custom_fields?.tg_chat_id,
    title: d.custom_fields?.tg_chat_title || d.title,
    deal_id: d.id,
    already_linked: linkedSet.has(String(d.custom_fields?.group_chat_id || d.custom_fields?.tg_chat_id)),
  })).filter(g => g.chat_id)
}

export async function linkClientGroup(clientId: number, chatId: string, chatTitle: string) {
  const { supabase, error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }

  const { error } = await supabase
    .from('clients')
    .update({
      tg_group_chat_id: Number(chatId),
      tg_group_title: chatTitle,
    })
    .eq('id', clientId)

  if (error) return { error: error.message }

  revalidatePath('/admin/clients')
  revalidatePath('/curator/clients')
  revalidatePath(`/curator/clients/${clientId}`)
  return { success: true }
}

/**
 * Возврат клиенту: помечает клиента как `refunded`, обнуляет приход
 * (зеркальные платежи с минусом для каждого оплаченного), удаляет
 * неоплаченные платежи и расходы. Уже оплаченные расходы не трогаем —
 * иначе сломается история отчётности по прошлым месяцам.
 */
export async function refundAndDeleteClient(clientId: number, reason?: string) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }

  const admin = await createAdminClient()

  const { data: client } = await admin
    .from('clients')
    .select('id, name, status')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) return { error: 'Клиент не найден' }
  if (client.status === 'refunded') return { error: 'Клиент уже в статусе «Возврат»' }

  const { data: payments } = await admin
    .from('payments')
    .select('id, num, plan_date, plan_sum, fact_sum, fact_date, is_paid')
    .eq('client_id', clientId)

  const today = new Date().toISOString().slice(0, 10)
  const noteSuffix = reason?.trim() ? ` · ${reason.trim()}` : ''

  // Зеркальные минусовые записи на каждый оплаченный платёж
  const refundRows = (payments ?? [])
    .filter(p => p.is_paid)
    .map(p => ({
      client_id: clientId,
      num: -1, // отрицательный № как маркер возврата
      plan_date: today,
      plan_sum: -Number(p.fact_sum ?? p.plan_sum),
      fact_date: today,
      fact_sum: -Number(p.fact_sum ?? p.plan_sum),
      is_paid: true,
      comment: `Возврат к платежу №${p.num}${noteSuffix}`,
    }))

  if (refundRows.length > 0) {
    const { error: refErr } = await admin.from('payments').insert(refundRows)
    if (refErr) return { error: `Не удалось записать возврат: ${refErr.message}` }
  }

  // Удаляем неоплаченные будущие платежи — их клиент уже не должен
  const { error: delPayErr } = await admin
    .from('payments')
    .delete()
    .eq('client_id', clientId)
    .eq('is_paid', false)
  if (delPayErr) return { error: `Не удалось удалить будущие платежи: ${delPayErr.message}` }

  // Удаляем только НЕоплаченные расходы — оплаченные оставляем
  // как реальные расходы прошлых периодов (не переписываем историю)
  const { error: delExpErr } = await admin
    .from('expenses')
    .delete()
    .eq('client_id', clientId)
    .eq('is_paid', false)
  if (delExpErr) return { error: `Не удалось удалить будущие расходы: ${delExpErr.message}` }

  const { error: updErr } = await admin
    .from('clients')
    .update({ status: 'refunded' })
    .eq('id', clientId)
  if (updErr) return { error: `Не удалось обновить статус клиента: ${updErr.message}` }

  revalidatePath('/admin')
  revalidatePath('/admin/clients')
  revalidatePath('/admin/payments')
  revalidatePath('/admin/expenses')
  return { success: true as const, refundedCount: refundRows.length }
}

export async function unlinkClientGroup(clientId: number) {
  const { supabase, error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }

  const { error } = await supabase
    .from('clients')
    .update({ tg_group_chat_id: null, tg_group_title: null })
    .eq('id', clientId)

  if (error) return { error: error.message }

  revalidatePath('/admin/clients')
  revalidatePath('/curator/clients')
  revalidatePath(`/curator/clients/${clientId}`)
  return { success: true }
}


// Сгенерировать (или достать существующую) invite-ссылку для клиента.
export async function generateClientInviteAction(clientId: number) {
  const { supabase, error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const { data: { user } } = await supabase.auth.getUser()
  const { createClientInvitation } = await import("@/lib/invitation")
  const result = await createClientInvitation(clientId, user?.id)
  if (!result.ok) return { error: result.error }
  return { success: true, url: result.url, emailSent: result.emailSent, emailError: result.emailError }
}

// Поправить email и переотправить invite-ссылку.
export async function resendClientInviteAction(clientId: number, newEmail?: string) {
  const { supabase, error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const { data: { user } } = await supabase.auth.getUser()
  const { resendClientInvitation } = await import("@/lib/invitation")
  const result = await resendClientInvitation(clientId, newEmail, user?.id)
  if (!result.ok) return { error: result.error }
  revalidatePath("/admin/clients")
  return { success: true, url: result.url, emailSent: result.emailSent, emailError: result.emailError }
}

