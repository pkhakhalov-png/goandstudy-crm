'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function addSalesperson(formData: FormData): Promise<{ error?: string, password?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const email = formData.get('email') as string
  const name = formData.get('name') as string
  const password = Math.random().toString(36).slice(-8) + 'Gs1!'

  const adminSupabase = await createAdminClient()
  const { data, error } = await adminSupabase.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name }
  })

  if (error) return { error: error.message }
  await adminSupabase.from('users').update({ name }).eq('id', data.user.id)
  revalidatePath('/admin/settings')
  return { password }
}

export async function resetSalespersonPassword(formData: FormData): Promise<{ error?: string, password?: string }> {
  const adminSupabase = await createAdminClient()
  const id = formData.get('id') as string
  const password = Math.random().toString(36).slice(-8) + 'Gs1!'
  const { error } = await adminSupabase.auth.admin.updateUserById(id, { password })
  if (error) return { error: error.message }
  return { password }
}

export async function deactivateSalesperson(formData: FormData): Promise<void> {
  const supabase = await createClient()
  await supabase.from('users').update({ is_active: false }).eq('id', formData.get('id') as string)
  revalidatePath('/admin/settings')
}

export async function activateSalesperson(formData: FormData): Promise<void> {
  const supabase = await createClient()
  await supabase.from('users').update({ is_active: true }).eq('id', formData.get('id') as string)
  revalidatePath('/admin/settings')
}

export async function updateSalespersonTg(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const id = formData.get('id') as string
  const raw = (formData.get('telegram_username') as string || '').trim()
  // Без префикса @, без пробелов; пустое значение → null
  const cleaned = raw.replace(/^@/, '').replace(/\s+/g, '') || null
  await supabase.from('users').update({ telegram_username: cleaned }).eq('id', id)
  revalidatePath('/admin/settings')
}

export async function addCurator(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const name = (formData.get('name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim() || null
  await supabase.from('curators').insert({ name, email })
  revalidatePath('/admin/settings')
}

export async function updateCuratorEmail(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const email = (formData.get('email') as string)?.trim() || null
  await supabase.from('curators').update({ email }).eq('id', formData.get('id') as string)
  revalidatePath('/admin/settings')
}

// Сгенерировать invite-ссылку куратору
export async function generateCuratorInviteAction(curatorId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Только админ' }

  const { createCuratorInvitation } = await import('@/lib/curator-invitation')
  const result = await createCuratorInvitation(curatorId, user.id)
  if (!result.ok) return { error: result.error }
  return { success: true, url: result.url, emailSent: result.emailSent, emailError: result.emailError }
}

export async function deactivateCurator(formData: FormData): Promise<void> {
  const supabase = await createClient()
  await supabase.from('curators').update({ is_active: false }).eq('id', formData.get('id') as string)
  revalidatePath('/admin/settings')
}

export async function activateCurator(formData: FormData): Promise<void> {
  const supabase = await createClient()
  await supabase.from('curators').update({ is_active: true }).eq('id', formData.get('id') as string)
  revalidatePath('/admin/settings')
}

export async function updateCuratorName(formData: FormData): Promise<void> {
  const supabase = await createClient()
  await supabase.from('curators').update({ name: formData.get('name') as string }).eq('id', formData.get('id') as string)
  revalidatePath('/admin/settings')
}

export async function addFixedExpense(formData: FormData): Promise<void> {
  const supabase = await createClient()
  await supabase.from('fixed_expenses').insert({
    name: formData.get('name') as string,
    period: formData.get('period') as string,
    article: formData.get('article') as string,
  })
  revalidatePath('/admin/settings')
}

export async function updateFixedExpense(formData: FormData): Promise<void> {
  const supabase = await createClient()
  await supabase.from('fixed_expenses').update({
    name: formData.get('name') as string,
    period: formData.get('period') as string,
    article: formData.get('article') as string,
  }).eq('id', formData.get('id') as string)
  revalidatePath('/admin/settings')
}

export async function toggleFixedExpense(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const isActive = formData.get('is_active') === 'true'
  await supabase.from('fixed_expenses').update({ is_active: !isActive }).eq('id', formData.get('id') as string)
  revalidatePath('/admin/settings')
}

export async function deleteFixedExpense(formData: FormData): Promise<void> {
  const supabase = await createClient()
  await supabase.from('fixed_expenses').delete().eq('id', formData.get('id') as string)
  revalidatePath('/admin/settings')
}