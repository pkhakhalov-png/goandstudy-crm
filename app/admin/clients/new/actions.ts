'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { normalizePhone } from '@/lib/phone'

export async function createClient_action(formData: FormData): Promise<void> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/sales')

  const salespersonId = formData.get('salesperson_id') as string || user.id
  const totalAmount = Number(formData.get('total_amount'))
  const firstPayDate = formData.get('first_pay_date') as string
  const phone = formData.get('phone') as string
  const curatorId = (formData.get('curator_id') as string) || null
  const clientName = formData.get('name') as string

  const { error } = await supabase.rpc('create_client_with_payments', {
    p_name: clientName,
    p_phone: phone,
    p_email: (formData.get('email') as string) || null,
    p_telegram: (formData.get('telegram') as string) || null,
    p_country: formData.get('country') as string,
    p_university: (formData.get('university') as string) || null,
    p_total_amount: totalAmount,
    p_months: Number(formData.get('months')),
    p_first_pay_date: firstPayDate,
    p_curator_id: curatorId,
    p_salesperson_id: salespersonId,
    p_notes: (formData.get('notes') as string) || null,
  })

  if (error) {
    console.error('[admin/clients/new] create_client_with_payments failed:', error)
    throw new Error(`Не удалось создать клиента: ${error.message}`)
  }

  // Find newly created client by name (most recent)
  const { data: newClient } = await supabase
    .from('clients')
    .select('id')
    .eq('name', clientName)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (newClient) {
    const normalized = normalizePhone(phone)
    const updates: Record<string, any> = {}
    if (normalized) updates.phone_normalized = normalized
    if (curatorId) {
      updates.current_stage_code = 'strategy_session'
      updates.curator_assigned_at = new Date().toISOString()
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from('clients').update(updates).eq('id', newClient.id)
    }
  }

  redirect('/admin/clients')
}
