'use server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function assertAdmin() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'нужен вход' }
  const { data: profile } = await sb.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'нет прав' }
  return {}
}

/** Поставить обход сайта в очередь. Работу делает воркер, а не это нажатие. */
export async function enqueueSiteIndexCheck() {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }

  const seo = (await createAdminClient()).schema('seo')

  const { data: running } = await seo.from('jobs').select('id')
    .eq('step', 'index_check_site').in('status', ['pending', 'running', 'waiting']).limit(1)
  if (running?.length) return { note: 'проверка уже в очереди — результат появится здесь сам' }

  // Сбрасываем сроки, иначе шаг возьмёт только просроченные и «сейчас» ничего не изменит
  await seo.from('index_status').update({ next_check_at: new Date().toISOString() }).gt('page_id', 0)
  await seo.from('jobs').insert({ step: 'index_check_site', lane: 'findings', priority: 95, payload: {} })

  revalidatePath('/admin/seo/indexation')
  return { note: 'Поставлено в очередь. Порциями по 60 адресов за тик — на весь сайт уходит несколько минут.' }
}
