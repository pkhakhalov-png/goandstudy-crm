'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function assertRop() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, error: 'Не авторизован' as const }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'rop' && profile?.role !== 'admin') return { supabase, user, error: 'Только РОП или админ' as const }
  return { supabase, user, error: null }
}

function reval() {
  revalidatePath('/rop')
  revalidatePath('/rop/conversions')
  revalidatePath('/rop/response-times')
  revalidatePath('/rop/pipeline')
  revalidatePath('/rop/stuck')
  revalidatePath('/rop/analytics')
  revalidatePath('/rop/tasks')
  revalidatePath('/rop/deals')
  revalidatePath('/rop/settings')
  revalidatePath('/rop/history')
}

async function logAction(ropId: string, actionType: string, dealId?: string, salespersonId?: string, metadata?: Record<string, unknown>) {
  const admin = await createAdminClient()
  await admin.from('rop_actions_log').insert({
    rop_id: ropId,
    action_type: actionType,
    deal_id: dealId || null,
    salesperson_id: salespersonId || null,
    metadata: metadata || {},
  })
}

export async function upsertSalesPlan(month: string, salespersonId: string | null, amount: number) {
  const { supabase, user, error: authErr } = await assertRop()
  if (authErr || !user) return { error: authErr }
  if (!(amount >= 0)) return { error: 'Сумма должна быть >= 0' }

  const { error } = await supabase
    .from('sales_plans')
    .upsert(
      { month, salesperson_id: salespersonId, plan_amount: amount, updated_at: new Date().toISOString() },
      { onConflict: 'month,salesperson_id' }
    )

  if (error) return { error: error.message }
  await logAction(user.id, 'set_plan', undefined, salespersonId || undefined, { month, amount })
  reval()
  return { success: true }
}

export async function reassignDeal(dealId: string, newSalespersonId: string) {
  const { supabase, user, error: authErr } = await assertRop()
  if (authErr || !user) return { error: authErr }

  const { data: deal } = await supabase.from('deals').select('salesperson_id').eq('id', dealId).single()
  if (!deal) return { error: 'Сделка не найдена' }

  const { error } = await supabase.from('deals').update({ salesperson_id: newSalespersonId }).eq('id', dealId)
  if (error) return { error: error.message }

  await supabase.from('deal_activities').insert({
    deal_id: dealId,
    user_id: user.id,
    activity_type: 'system',
    content: 'РОП переназначил сделку',
    metadata: { from: deal.salesperson_id, to: newSalespersonId },
  })
  await logAction(user.id, 'reassign', dealId, newSalespersonId)
  reval()
  return { success: true }
}

export async function createRopTask(dealId: string, title: string, deadline: string, assignedTo?: string) {
  const { supabase, user, error: authErr } = await assertRop()
  if (authErr || !user) return { error: authErr }
  if (!title.trim()) return { error: 'Заполните название задачи' }

  const { error } = await supabase.from('deal_tasks').insert({
    deal_id: dealId,
    title: title.trim(),
    deadline: deadline || null,
    assigned_to: assignedTo || null,
    task_type: 'rop_action',
  })

  if (error) return { error: error.message }
  await logAction(user.id, 'create_task', dealId, assignedTo, { title })
  reval()
  return { success: true }
}

export async function markCritical(dealId: string, critical: boolean) {
  const { supabase, user, error: authErr } = await assertRop()
  if (authErr || !user) return { error: authErr }

  const { error } = await supabase.from('deals').update({ is_critical: critical }).eq('id', dealId)
  if (error) return { error: error.message }
  await logAction(user.id, 'mark_critical', dealId, undefined, { critical })
  reval()
  return { success: true }
}

export async function watchSalesperson(salespersonId: string, watch: boolean) {
  const { supabase, user, error: authErr } = await assertRop()
  if (authErr || !user) return { error: authErr }

  const { data: setting } = await supabase.from('rop_settings').select('value').eq('key', 'watched_salespersons').single()
  const list: string[] = setting?.value ? (Array.isArray(setting.value) ? setting.value : []) : []

  const updated = watch
    ? [...new Set([...list, salespersonId])]
    : list.filter(id => id !== salespersonId)

  const { error } = await supabase
    .from('rop_settings')
    .update({ value: JSON.stringify(updated), updated_at: new Date().toISOString() })
    .eq('key', 'watched_salespersons')

  if (error) return { error: error.message }
  await logAction(user.id, 'watch', undefined, salespersonId, { watch })
  reval()
  return { success: true }
}

export async function updateRopSetting(key: string, value: unknown) {
  const { supabase, user, error: authErr } = await assertRop()
  if (authErr || !user) return { error: authErr }

  const { error } = await supabase
    .from('rop_settings')
    .update({ value: JSON.stringify(value), updated_at: new Date().toISOString() })
    .eq('key', key)

  if (error) return { error: error.message }
  await logAction(user.id, 'update_setting', undefined, undefined, { key, value })
  reval()
  return { success: true }
}
