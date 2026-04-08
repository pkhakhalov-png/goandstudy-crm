'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function markPaymentPaid(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const paymentId = Number(formData.get('payment_id'))
  const factDate = formData.get('fact_date') as string
  const factSum = Number(formData.get('fact_sum'))
  const comment = formData.get('comment') as string

  await supabase
    .from('payments')
    .update({
      is_paid: true,
      fact_date: factDate || new Date().toISOString().split('T')[0],
      fact_sum: factSum,
      comment: comment || null,
      updated_by: user.id,
    })
    .eq('id', paymentId)

  revalidatePath('/admin/payments')
}

export async function unmarkPaymentPaid(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const paymentId = Number(formData.get('payment_id'))

  await supabase
    .from('payments')
    .update({
      is_paid: false,
      fact_date: null,
      fact_sum: null,
      comment: null,
      updated_by: user.id,
    })
    .eq('id', paymentId)

  revalidatePath('/admin/payments')
}

export async function editPayment(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const paymentId = Number(formData.get('payment_id'))
  const factDate = formData.get('fact_date') as string
  const factSum = Number(formData.get('fact_sum'))
  const comment = formData.get('comment') as string

  await supabase
    .from('payments')
    .update({
      fact_date: factDate || null,
      fact_sum: factSum || null,
      comment: comment || null,
      updated_by: user.id,
    })
    .eq('id', paymentId)

  revalidatePath('/admin/payments')
}