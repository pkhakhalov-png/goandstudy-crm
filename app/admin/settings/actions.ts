'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function addSalesperson(formData: FormData): Promise<{ error?: string, password?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const email = formData.get('email') as string
  const name = formData.get('name') as string

  // Генерируем временный пароль
  const password = Math.random().toString(36).slice(-8) + 'Gs1!'

  // Создаём пользователя через service role
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name }
  })

  if (error) return { error: error.message }

  // Обновляем имя в public.users (триггер создаст запись)
  await supabase.from('users').update({ name }).eq('id', data.user.id)

  revalidatePath('/admin/settings')
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

export async function addCurator(formData: FormData): Promise<void> {
  const supabase = await createClient()
  await supabase.from('curators').insert({ name: formData.get('name') as string })
  revalidatePath('/admin/settings')
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