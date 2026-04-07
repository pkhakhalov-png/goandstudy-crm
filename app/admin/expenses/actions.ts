'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function addExpense(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('expenses').insert({
    client_id: Number(formData.get('client_id')),
    article: formData.get('article') as string,
    who: formData.get('who') as string || null,
    plan_date: formData.get('plan_date') as string || null,
    plan_sum: Number(formData.get('plan_sum')),
    fact_date: formData.get('fact_date') as string || null,
    fact_sum: formData.get('fact_sum') ? Number(formData.get('fact_sum')) : null,
    is_paid: formData.get('fact_sum') ? true : false,
    status: formData.get('fact_sum') ? 'paid' : 'pending',
    note: formData.get('note') as string || null,
  })

  revalidatePath('/admin/expenses')
}

export async function markExpensePaid(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('expenses').update({
    is_paid: true,
    status: 'paid',
    fact_date: formData.get('fact_date') as string,
    fact_sum: Number(formData.get('fact_sum')),
  }).eq('id', formData.get('expense_id') as string)

  revalidatePath('/admin/expenses')
}