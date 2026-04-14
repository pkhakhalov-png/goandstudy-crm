'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function createClientSales(formData: FormData): Promise<void> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const totalAmount = Number(formData.get('total_amount'))
  const firstPayDate = formData.get('first_pay_date') as string

  const { error } = await supabase.rpc('create_client_with_payments', {
    p_name: formData.get('name') as string,
    p_phone: formData.get('phone') as string,
    p_email: (formData.get('email') as string) || null,
    p_telegram: (formData.get('telegram') as string) || null,
    p_country: formData.get('country') as string,
    p_university: (formData.get('university') as string) || null,
    p_total_amount: totalAmount,
    p_months: Number(formData.get('months')),
    p_first_pay_date: firstPayDate,
    p_curator_id: (formData.get('curator_id') as string) || null,
    p_salesperson_id: user.id,
    p_notes: (formData.get('notes') as string) || null,
  })

  if (error) {
    console.error('[sales/new] create_client_with_payments failed:', error)
    redirect(`/sales/new?error=${encodeURIComponent(error.message || 'Ошибка создания клиента')}`)
  }

  redirect('/sales')
}