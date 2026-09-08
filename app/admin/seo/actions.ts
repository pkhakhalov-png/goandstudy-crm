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

// Запустить импорт Google Search Console (нужны env GSC_*).
export async function startGscImport() {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const seo = (await createAdminClient()).schema('seo')
  const { data: ex } = await seo.from('jobs').select('id').eq('step', 'gsc_import').in('status', ['pending', 'running']).limit(1)
  if (ex?.length) return { error: 'Импорт GSC уже идёт' }
  const { error } = await seo.from('jobs').insert({ step: 'gsc_import', lane: 'gsc', priority: 40, payload: {} })
  if (error) return { error: error.message }
  return { success: true }
}

// Проверить «ссылки в никуда» (404 → broken_link).
export async function startCheckLinks() {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const seo = (await createAdminClient()).schema('seo')
  const { data: ex } = await seo.from('jobs').select('id').eq('step', 'check_missing_links').in('status', ['pending', 'running']).limit(1)
  if (ex?.length) return { error: 'Проверка уже идёт' }
  const { error } = await seo.from('jobs').insert({ step: 'check_missing_links', lane: 'crawl', priority: 45, payload: {} })
  if (error) return { error: error.message }
  return { success: true }
}

// Пересчитать находки из инвентаря (orphan / дубли title / content_gap / похожесть).
export async function recomputeFindings() {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const admin = await createAdminClient()
  const seo = admin.schema('seo')
  const { data: ex } = await seo.from('jobs').select('id').eq('step', 'findings_inventory').in('status', ['pending', 'running']).limit(1)
  if (ex?.length) return { error: 'Пересчёт уже идёт' }
  const { error } = await seo.from('jobs').insert({ step: 'findings_inventory', lane: 'findings', priority: 40, payload: {} })
  if (error) return { error: error.message }
  revalidatePath('/admin/seo/findings')
  return { success: true }
}
