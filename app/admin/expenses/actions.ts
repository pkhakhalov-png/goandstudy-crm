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
    is_paid: false,
    status: 'pending',
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

export async function markExpenseUnpaid(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('expenses').update({
    is_paid: false,
    status: 'pending',
    fact_date: null,
    fact_sum: null,
  }).eq('id', formData.get('expense_id') as string)

  revalidatePath('/admin/expenses')
}

export async function updateExpense(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('expenses').update({
    plan_sum: Number(formData.get('plan_sum')),
    who: formData.get('who') as string || null,
    plan_date: formData.get('plan_date') as string || null,
    note: formData.get('note') as string || null,
  }).eq('id', formData.get('expense_id') as string)

  revalidatePath('/admin/expenses')
}

export async function addFixedExpenseRecord(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('fixed_expense_records').insert({
    fixed_expense_id: formData.get('fixed_id') as string,
    month: formData.get('month') as string,
    amount: Number(formData.get('amount')),
    is_paid: false,
    note: formData.get('note') as string || null,
  })

  revalidatePath('/admin/expenses')
}

export async function markFixedRecordPaid(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('fixed_expense_records').update({
    is_paid: true,
    fact_date: formData.get('fact_date') as string,
    fact_amount: Number(formData.get('fact_amount')),
  }).eq('id', formData.get('record_id') as string)

  revalidatePath('/admin/expenses')
}

export async function markFixedRecordUnpaid(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('fixed_expense_records').update({
    is_paid: false,
    fact_date: null,
    fact_amount: null,
  }).eq('id', formData.get('record_id') as string)

  revalidatePath('/admin/expenses')
}

export async function deleteFixedExpenseRecord(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('fixed_expense_records')
    .delete()
    .eq('id', formData.get('record_id') as string)

  revalidatePath('/admin/expenses')
}