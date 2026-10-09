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
    // Неверная пара email/пароль — это 400 invalid_credentials. Всё остальное
    // (таймауты, 5xx, лежащая база) не повод говорить человеку про пароль:
    // так 9 октября сотрудница полдня перебирала верный пароль.
    if (error.code === 'invalid_credentials') return { error: 'Неверный email или пароль' }
    return { error: 'Сервер базы сейчас не отвечает. Пароль тут ни при чём — попробуйте через пару минут.' }
  }

  console.log('[LOGIN OK]', { userId: data?.user?.id, email: data?.user?.email })

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'Ошибка входа' }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  // Без роли не угадываем кабинет: раньше любой сбой чтения отправлял в /sales
  if (profileError && profileError.code !== 'PGRST116') {
    return { error: 'Вход прошёл, но роль не прочиталась: база отвечает с перебоями. Попробуйте через пару минут.' }
  }

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