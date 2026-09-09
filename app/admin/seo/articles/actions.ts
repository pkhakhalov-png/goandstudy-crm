'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { finalPreflight, checkPublishRate, publishDraft, promoteToPublish, type PublishInput } from '@/lib/seo/publish'
import { getAuthor } from '@/lib/seo/authors'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' as const }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Только админ' as const }
  return { error: null }
}

/** Собрать данные публикации из текущей версии. Один источник для всех действий. */
async function buildPayload(seo: any, articleId: number) {
  const { data: article } = await seo.from('articles')
    .select('id, current_version_id, primary_keyword, page_id, status').eq('id', articleId).single()
  if (!article) throw new Error('статья не найдена')
  const { data: version } = await seo.from('article_versions')
    .select('id, title, body, meta').eq('id', article.current_version_id).single()
  if (!version) throw new Error('версия не найдена')

  const meta: any = version.meta ?? {}
  const brief: any = meta.brief ?? {}
  const postType: 'post' | 'page' = meta.publish?.post_type ?? 'post'
  const slug: string = meta.publish?.slug ?? meta.slug ?? ''
  const url = postType === 'page' ? `https://goandstudy.com/${slug}/` : `https://goandstudy.com/blog/${slug}/`

  const payload: PublishInput = {
    articleId: article.id, versionId: version.id,
    title: version.title ?? '', h1: brief.h1 ?? version.title ?? '',
    description: meta.description ?? '', slug,
    html: version.body ?? '', primaryKeyword: article.primary_keyword ?? '',
    imageUrl: meta.images?.cover?.url ?? null, author: getAuthor(),
    breadcrumbs: postType === 'page'
      ? [{ name: 'Главная', url: 'https://goandstudy.com/' }, { name: brief.h1 ?? '', url }]
      : [{ name: 'Главная', url: 'https://goandstudy.com/' }, { name: 'Блог', url: 'https://goandstudy.com/blog/' }, { name: brief.h1 ?? '', url }],
  }
  return { article, version, meta, payload, postType, url }
}

async function loadSiteStrings(seo: any) {
  const knownUrls = new Set<string>(); const existingTitles = new Set<string>()
  const existingDescriptions = new Set<string>(); const existingSlugs = new Set<string>()
  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').replace(/[«»"'’]/g, '').trim()
  for (let from = 0; ; from += 1000) {
    const { data } = await seo.from('pages').select('url,normalized_url,title,meta_desc').is('removed_at', null).range(from, from + 999)
    for (const p of data ?? []) {
      knownUrls.add(String(p.url).replace(/\/$/, '')); knownUrls.add(String(p.normalized_url).replace(/\/$/, ''))
      if (p.title) existingTitles.add(norm(String(p.title)))
      if (p.meta_desc) existingDescriptions.add(norm(String(p.meta_desc)))
      const seg = String(p.normalized_url).replace(/\/$/, '').split('/').pop(); if (seg) existingSlugs.add(seg)
    }
    if (!data || data.length < 1000) break
  }
  return { knownUrls, existingTitles, existingDescriptions, existingSlugs }
}

/** Утвердить: человек прочитал и берёт ответственность (§1, уровень A0). */
export async function approveArticle(articleId: number) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const admin = await createAdminClient()
  const seo = admin.schema('seo')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await seo.from('articles').update({ status: 'approved', author_id: user?.id ?? null }).eq('id', articleId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/seo/articles/${articleId}`)
  return { ok: true }
}

export async function rejectArticle(articleId: number, reason: string) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const admin = await createAdminClient()
  const seo = admin.schema('seo')
  const { error } = await seo.from('articles').update({ status: 'rejected' }).eq('id', articleId)
  if (error) return { error: error.message }
  await seo.from('change_sets').insert({
    article_id: articleId, kind: 'new_article', reason: `отклонено человеком: ${reason || 'без причины'}`,
    idempotency_key: `reject:${articleId}:${Date.now()}`, status: 'rejected', proposed_by: 'human',
  })
  revalidatePath(`/admin/seo/articles/${articleId}`)
  return { ok: true }
}

/** Черновик в WordPress. Публичного адреса не появляется — §12.1.1. */
export async function sendDraftToWp(articleId: number) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const admin = await createAdminClient()
  const seo = admin.schema('seo')

  try {
    const { meta, payload, postType } = await buildPayload(seo, articleId)
    const site = await loadSiteStrings(seo)
    const pre = finalPreflight(payload, site)
    const blockers = pre.blockers.filter((c) => !(c.id.startsWith('7.8') && meta.publish?.reclaim))
    if (blockers.length) {
      return { error: `Проверки не пройдены: ${blockers.map((c) => c.id).join(', ')}` }
    }
    const res = await publishDraft(seo, payload, {
      postType,
      featuredMedia: meta.images?.cover?.media_id ?? null,
      reason: meta.publish?.reclaim ? 'адрес занимается намеренно, сейчас редиректит (§13.4)' : undefined,
    })
    if (!res.ok) return { error: res.reason }

    // Запоминаем номер поста: без него экран не знает, что публиковать дальше
    const { data: v } = await seo.from('article_versions').select('id, meta').eq('id', payload.versionId).single()
    const m: any = v?.meta ?? {}
    await seo.from('article_versions')
      .update({ meta: { ...m, publish: { ...(m.publish ?? {}), post_id: res.postId, post_type: postType, slug: payload.slug } } })
      .eq('id', payload.versionId)

    revalidatePath(`/admin/seo/articles/${articleId}`)
    return { ok: true, postId: res.postId }
  } catch (e: any) {
    return { error: e?.message ?? 'ошибка публикации' }
  }
}

/** Выпуск в свет. Здесь же — темп публикаций и проверка глазами бота с откатом. */
export async function publishArticle(articleId: number, postId: number) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const admin = await createAdminClient()
  const seo = admin.schema('seo')

  try {
    const { payload } = await buildPayload(seo, articleId)
    const rate = await checkPublishRate(seo)
    if (!rate.ok) return { error: rate.reason }
    const res = await promoteToPublish(seo, articleId, postId, payload)
    revalidatePath(`/admin/seo/articles/${articleId}`)
    return res.ok ? { ok: true } : { error: res.reason }
  } catch (e: any) {
    return { error: e?.message ?? 'ошибка публикации' }
  }
}

/* ── Запуск конвейера из CRM ──────────────────────────────────────────────── */

/**
 * Кладёт задачу в очередь. Сама генерация идёт в воркере: она занимает минуты,
 * а веб-запрос столько не живёт. Пока воркер не запущен, задача просто ждёт —
 * это видно в очереди на экране «Статьи».
 */
export async function enqueueArticle(input: { query?: string; topicId?: number }) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const query = (input.query ?? '').trim()
  if (!query && !input.topicId) return { error: 'Укажи запрос или выбери тему' }

  const admin = await createAdminClient()
  const seo = admin.schema('seo')

  // Не плодим дубли: одна активная задача на тему/запрос
  const dedup = input.topicId ? `article:topic:${input.topicId}` : `article:query:${query.toLowerCase()}`
  const { data: running } = await seo.from('jobs').select('id')
    .like('step', 'article_%').in('status', ['pending', 'running', 'waiting']).eq('dedup_key', dedup).limit(1)
  if (running?.length) return { error: 'Такая статья уже в работе' }

  const { error } = await seo.from('jobs').insert({
    step: 'article_brief', lane: 'production', priority: 50,
    topic_id: input.topicId ?? null,
    payload: input.topicId ? { topic_id: input.topicId } : { query },
    dedup_key: `${dedup}:${Date.now()}`,
  })
  if (error) return { error: error.message }

  revalidatePath('/admin/seo/articles')
  return { ok: true }
}

/** Снять задачу из очереди. */
export async function cancelJob(jobId: number) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const admin = await createAdminClient()
  const seo = admin.schema('seo')
  const { error } = await seo.from('jobs').update({ status: 'cancelled' }).eq('id', jobId).in('status', ['pending', 'waiting'])
  if (error) return { error: error.message }
  revalidatePath('/admin/seo/articles')
  return { ok: true }
}
