'use server'

import { createClient } from '@/lib/supabase/server'
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

  const { error } = await supabase
    .from('payments')
    .update({ plan_sum: newSum })
    .eq('id', paymentId)

  if (error) return { error: error.message }
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
    .select('id, plan_sum, is_paid, plan_date')
    .eq('client_id', clientId)
    .order('plan_date', { ascending: true })

  if (!payments || payments.length === 0) return { error: 'У клиента нет платежей' }

  const paidSum = payments
    .filter(p => p.is_paid)
    .reduce((s, p) => s + Number(p.plan_sum), 0)

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
    .update({ curator_id: curator.id })
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
  return { success: true }
}
