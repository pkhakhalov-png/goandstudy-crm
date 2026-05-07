import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DEMO_EMAIL, DEMO_PASSWORD } from '@/lib/demo-seed'

export const dynamic = 'force-dynamic'

/**
 * Публичная демо-страница: авто-логин под demo@goandstudy.com и переход в /client.
 * Любой может зайти на /demo без креденшелов — увидит наполненный кабинет.
 *
 * Изменения которые внесёт демо-юзер сбрасываются часовым cron'ом
 * (app/api/cron/reset-demo).
 */
export default async function DemoLoginPage() {
  const supabase = await createClient()
  const { data: existing } = await supabase.auth.getUser()

  // Если уже залогинен под demo — сразу в кабинет
  if (existing.user?.email === DEMO_EMAIL) {
    redirect('/client?onboarding=1')
  }

  // Иначе — выходим из текущего и логинимся как demo
  if (existing.user) {
    await supabase.auth.signOut()
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  })

  if (error) {
    return (
      <div style={{ padding: 40, fontFamily: 'system-ui', maxWidth: 720, margin: '0 auto' }}>
        <h1>Демо-кабинет недоступен</h1>
        <p>{error.message}</p>
        <p style={{ color: '#666' }}>Попробуй обновить страницу или обратись в поддержку.</p>
      </div>
    )
  }

  redirect('/client?onboarding=1')
}
