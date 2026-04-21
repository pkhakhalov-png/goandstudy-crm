'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function markPaymentPaidSales(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('payments')
    .update({
      is_paid: true,
      fact_date: formData.get('fact_date') as string || new Date().toISOString().split('T')[0],
      fact_sum: Number(formData.get('fact_sum')),
      comment: formData.get('comment') as string || null,
    })
    .eq('id', formData.get('payment_id') as string)

  revalidatePath('/sales')
}

export async function unmarkPaymentPaidSales(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('payments')
    .update({
      is_paid: false,
      fact_date: null,
      fact_sum: null,
      comment: null,
    })
    .eq('id', formData.get('payment_id') as string)

  revalidatePath('/sales')
}

export async function completeTask(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const taskId = formData.get('task_id') as string
  const admin = await createAdminClient()

  await admin.from('deal_tasks').update({
    is_done: true,
    completed_at: new Date().toISOString(),
  }).eq('id', taskId)

  revalidatePath('/sales')
  revalidatePath('/rop')
  return { success: true }
}
