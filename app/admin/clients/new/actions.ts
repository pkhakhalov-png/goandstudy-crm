'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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

  await supabase.rpc('create_client_with_payments', {
    p_name: formData.get('name') as string,
    p_phone: formData.get('phone') as string,
    p_email: (formData.get('email') as string) || null,
    p_telegram: (formData.get('telegram') as string) || null,
    p_country: formData.get('country') as string,
    p_university: (formData.get('university') as string) || null,
    p_total_amount: Number(formData.get('total_amount')),
    p_months: Number(formData.get('months')),
    p_first_pay_date: formData.get('first_pay_date') as string,
    p_curator_id: (formData.get('curator_id') as string) || null,
    p_salesperson_id: salespersonId,
    p_notes: (formData.get('notes') as string) || null,
  })

  redirect('/admin/clients')
}