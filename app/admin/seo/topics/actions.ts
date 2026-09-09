'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createTopicWithCluster } from '@/lib/seo/topics'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' as const }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Только админ' as const }
  return { error: null }
}

// Создать тему статьи с учётом кластеров (кластер + проверка дублей + перелинковка).
export async function createArticleTopic(input: { title: string; primary_keyword?: string; intent?: string }) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { ok: false as const, error: authErr }
  try {
    const seo = (await createAdminClient()).schema('seo')
    const res = await createTopicWithCluster(seo, input)
    revalidatePath('/admin/seo/topics')
    if (res.error) return { ok: false as const, error: res.error, result: res }
    return { ok: true as const, result: res }
  } catch (e: any) {
    return { ok: false as const, error: e?.message ?? 'ошибка' }
  }
}

// Одобрить/отклонить тему вручную.
export async function setTopicStatus(id: number, status: string) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const seo = (await createAdminClient()).schema('seo')
  const { error } = await seo.from('topics').update({ status }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/seo/topics')
  return { success: true }
}
