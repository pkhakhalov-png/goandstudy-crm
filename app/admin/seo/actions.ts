'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const SITEMAP_URL = 'https://goandstudy.com/sitemap.xml'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' as const }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Только админ' as const }
  return { error: null }
}

// Запустить инвентарь: одна задача inventory_sitemap → веер crawl_page (воркер обойдёт).
export async function startInventory() {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }

  const admin = await createAdminClient()
  const seo = admin.schema('seo')

  const { data: existing } = await seo.from('jobs').select('id')
    .in('step', ['inventory_sitemap', 'crawl_page'])
    .in('status', ['pending', 'running', 'waiting']).limit(1)
  if (existing?.length) return { error: 'Инвентарь уже идёт — дождись завершения' }

  const { error } = await seo.from('jobs').insert({
    step: 'inventory_sitemap', lane: 'crawl', priority: 50, payload: { sitemap_url: SITEMAP_URL },
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/seo/pages')
  return { success: true }
}
