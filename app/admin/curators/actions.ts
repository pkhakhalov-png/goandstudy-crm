'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' as const }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Только админ' as const }
  return { error: null }
}

export async function createCurator(formData: FormData) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }

  const name = (formData.get('name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim()
  const password = (formData.get('password') as string)?.trim()
  const telegramUsername = (formData.get('telegram_username') as string)?.trim() || null
  const maxClients = Number(formData.get('max_clients') || 20)
  const specializations = (formData.get('specializations') as string)?.split(',').map(s => s.trim()).filter(Boolean) || []
  const languages = (formData.get('languages') as string)?.split(',').map(s => s.trim()).filter(Boolean) || []

  if (!name || !email || !password) {
    return { error: 'Заполните имя, email и пароль' }
  }

  if (password.length < 6) {
    return { error: 'Пароль должен быть минимум 6 символов' }
  }

  const admin = await createAdminClient()

  // 1. Create auth user
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  })

  if (authError) {
    if (authError.message.includes('already') || authError.message.includes('exists')) {
      return { error: `Пользователь с email ${email} уже существует` }
    }
    return { error: `Ошибка создания: ${authError.message}` }
  }

  const userId = authData.user.id

  // 2. Upsert into public.users
  const { error: usersErr } = await admin
    .from('users')
    .upsert({ id: userId, email, name, role: 'curator', is_active: true }, { onConflict: 'id' })

  if (usersErr) {
    return { error: `Ошибка users: ${usersErr.message}` }
  }

  // 3. Insert into public.curators
  const { error: curatorErr } = await admin
    .from('curators')
    .insert({
      name,
      contact: email,
      is_active: true,
      user_id: userId,
      specializations: specializations.length > 0 ? specializations : null,
      languages: languages.length > 0 ? languages : null,
      max_clients: maxClients,
      telegram_username: telegramUsername,
    })

  if (curatorErr) {
    return { error: `Ошибка curators: ${curatorErr.message}` }
  }

  revalidatePath('/admin/curators')
  redirect('/admin/curators')
}

export async function updateCurator(curatorId: string, formData: FormData) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }

  const name = (formData.get('name') as string)?.trim()
  const telegramUsername = (formData.get('telegram_username') as string)?.trim() || null
  const maxClients = Number(formData.get('max_clients') || 20)
  const isActive = formData.get('is_active') === 'true'
  const specializations = (formData.get('specializations') as string)?.split(',').map(s => s.trim()).filter(Boolean) || []
  const languages = (formData.get('languages') as string)?.split(',').map(s => s.trim()).filter(Boolean) || []

  if (!name) return { error: 'Имя обязательно' }

  const admin = await createAdminClient()

  const { error } = await admin
    .from('curators')
    .update({
      name,
      is_active: isActive,
      specializations: specializations.length > 0 ? specializations : null,
      languages: languages.length > 0 ? languages : null,
      max_clients: maxClients,
      telegram_username: telegramUsername,
    })
    .eq('id', curatorId)

  if (error) return { error: error.message }

  // Also update name in users table if linked
  const { data: curator } = await admin.from('curators').select('user_id').eq('id', curatorId).single()
  if (curator?.user_id) {
    await admin.from('users').update({ name, is_active: isActive }).eq('id', curator.user_id)
  }

  revalidatePath('/admin/curators')
  revalidatePath(`/admin/curators/${curatorId}`)
  return { success: true }
}
