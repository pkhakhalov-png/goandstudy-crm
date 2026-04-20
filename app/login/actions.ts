'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = (formData.get('email') as string).trim()
  const password = formData.get('password') as string

  const { error, data } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    console.error('[LOGIN ERROR]', {
      message: error.message,
      status: error.status,
      code: error.code,
      name: error.name,
      email: email,
      emailLength: email.length,
      passwordLength: password.length,
    })
    return { error: 'Неверный email или пароль' }
  }

  console.log('[LOGIN OK]', { userId: data?.user?.id, email: data?.user?.email })

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'Ошибка входа' }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin?welcome=1')
  else if (profile?.role === 'rop') redirect('/rop?welcome=1')
  else if (profile?.role === 'curator') redirect('/curator?welcome=1')
  else redirect('/sales?welcome=1')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}