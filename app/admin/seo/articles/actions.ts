'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { enqueueJob } from '@/lib/seo/enqueue'
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

  // Ворота достоверности. Согласовать статью с неподтверждённой стоимостью или
  // дедлайном нельзя: ошибка в таком утверждении стоит читателю денег или года.
  const gate = await checkFactsFor(seo, articleId)
  if (gate.blocking.length) {
    return {
      error: `Нельзя утвердить: ${gate.blocking.length} существенных утверждений без подтверждения. `
        + gate.blocking.slice(0, 2).map((b) => `«${b.statement}» — ${b.why}`).join('; ')
        + '. Подтвердите их в разделе «Факты» или уберите из текста.',
    }
  }

  const { error } = await seo.from('articles').update({ status: 'approved', author_id: user?.id ?? null }).eq('id', articleId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/seo/articles/${articleId}`)
  return { ok: true, note: gate.warnings.length ? `Утверждено. Осталось ${gate.warnings.length} замечаний, не блокирующих выпуск.` : undefined }
}

/** Собрать текст статьи и прогнать через ворота достоверности. */
export async function checkFactsFor(seo: any, articleId: number) {
  const { factGate } = await import('@/lib/seo/fact-gate')
  const { subjectKeysFor } = await import('@/lib/seo/claims')

  const { data: article } = await seo.from('articles').select('current_version_id, primary_keyword, topic_id').eq('id', articleId).single()
  if (!article) return { blocking: [], warnings: [], checked: 0 }

  const { data: version } = await seo.from('article_versions').select('title, body').eq('id', article.current_version_id).single()
  const { data: topic } = article.topic_id
    ? await seo.from('topics').select('title, primary_keyword').eq('id', article.topic_id).single()
    : { data: null }

  const subject = [article.primary_keyword, topic?.primary_keyword, topic?.title].filter(Boolean).join(' ')
  return factGate(seo, `${version?.title ?? ''} ${version?.body ?? ''}`, subjectKeysFor(subject))
}

/** Подтверждение эксперта: подпись, а не галочка — с записью, кто и когда. */
export async function confirmFact(claimId: number, note: string) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'нужен вход' }

  const seo = (await createAdminClient()).schema('seo')
  const { confirmByExpert } = await import('@/lib/seo/fact-gate')
  const res = await confirmByExpert(seo, claimId, user.id, note)
  if (res.error) return { error: res.error }

  revalidatePath('/admin/seo/articles')
  return { ok: true, note: 'Подтверждено. Запись о том, кто поручился, сохранена.' }
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

    // Публикуем без ожидания: проверку страницы глазами бота делает очередь через
    // минуту. Ждать её в веб-запросе нельзя — Vercel оборвёт, и откат не сработает.
    const res = await promoteToPublish(seo, articleId, postId)
    if (!res.ok) return { error: res.reason }

    await seo.from('jobs').insert({
      step: 'article_verify', lane: 'production', priority: 20,
      article_id: articleId, payload: { post_id: postId },
      next_run_at: new Date(Date.now() + 70_000).toISOString(),
    })

    revalidatePath(`/admin/seo/articles/${articleId}`)
    return { ok: true, note: 'опубликовано; через минуту система проверит страницу и вернёт в черновики, если что-то сломалось' }
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

/**
 * Вставить запланированные входящие ссылки (§8.9).
 *
 * Доноры бывают двух видов, и это не мелочь: страницы WordPress правятся через мост,
 * а статьи блога живут файлами в теме — правку через мост там затрёт при следующем
 * пересиде. Для них задача уходит агенту на сервере.
 */
export async function insertIncomingLinks(articleId: number, dryRun = true) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const admin = await createAdminClient()
  const seo = admin.schema('seo')

  const { planInsertion, applyInsertion } = await import('@/lib/seo/linkinsert')

  const { data: article } = await seo.from('articles')
    .select('id, topic_id, status, current_version_id').eq('id', articleId).single()
  if (!article) return { error: 'статья не найдена' }
  if (article.status !== 'published' && !dryRun) {
    return { error: 'статья не опубликована — ссылка вела бы на несуществующую страницу' }
  }

  const { data: version } = await seo.from('article_versions').select('meta').eq('id', article.current_version_id).single()
  const meta: any = version?.meta ?? {}
  const slug = meta.publish?.slug ?? meta.slug
  const targetUrl = `https://goandstudy.com/blog/${slug}/`

  const { data: links } = await seo.from('link_suggestions')
    .select('id, from_page_id, anchor').eq('to_topic_id', article.topic_id)
    .in('status', ['proposed', 'waiting_target'])
  if (!links?.length) return { error: 'план ссылок пуст' }

  const { data: pages } = await seo.from('pages').select('id, url').in('id', links.map((l: any) => l.from_page_id))
  const byId = new Map((pages ?? []).map((p: any) => [p.id, p.url]))

  const report: { url: string; ok: boolean; note: string }[] = []
  for (const l of links) {
    const donorUrl = String(byId.get(l.from_page_id) ?? '')
    if (!donorUrl) { report.push({ url: `page ${l.from_page_id}`, ok: false, note: 'страница не найдена' }); continue }

    // Статья блога: правит агент на сервере, иначе тема затрёт
    if (donorUrl.includes('/blog/')) {
      const donorSlug = donorUrl.replace(/\/$/, '').split('/').pop()!
      if (dryRun) {
        report.push({ url: donorUrl, ok: true, note: `файл темы: ссылка «${l.anchor}» встанет через агента на сервере` })
        continue
      }
      const { data: exists } = await seo.from('jobs').select('id')
        .eq('step', 'link_insert_theme').eq('article_id', articleId)
        .in('status', ['pending', 'running']).contains('payload', { slug: donorSlug }).limit(1)
      if (exists?.length) { report.push({ url: donorUrl, ok: true, note: 'уже в очереди у агента' }); continue }

      await enqueueJob(seo, {
        step: 'link_insert_theme', lane: 'production', priority: 15, runner: 'agent',
        article_id: articleId, topic_id: article.topic_id,
        payload: { slug: donorSlug, anchor: l.anchor, target: targetUrl, suggestion_id: l.id },
      })
      report.push({ url: donorUrl, ok: true, note: `поставлено агенту: «${l.anchor}»` })
      continue
    }

    // Обычная страница WordPress: правим через мост
    const res: any = await planInsertion(donorUrl, l.anchor, targetUrl)
    if (!res.ok) { report.push({ url: donorUrl, ok: false, note: res.reason }); continue }
    if (!dryRun) {
      await applyInsertion(seo, res.plan, res.newHtml, articleId)
      await seo.from('link_suggestions').update({ status: 'applied' }).eq('id', l.id)
    }
    report.push({ url: donorUrl, ok: true, note: `анкор «${l.anchor}»: …${res.plan.before.slice(-50)}[${l.anchor}]${res.plan.after.slice(0, 50)}…` })
  }

  revalidatePath(`/admin/seo/articles/${articleId}`)
  return { ok: true, dryRun, report }
}

/* ── Публикация в блог по устройству темы ─────────────────────────────────── */

/**
 * Статья блога — это файлы в теме, а тема принадлежит root и для PHP закрыта
 * (и это правильно: взломанный WordPress не должен переписывать свои же файлы).
 * Поэтому кнопка ставит задачу, а исполняет её воркер, у которого есть SSH.
 */
export async function publishToBlog(articleId: number, dryRun = true, update = false) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const admin = await createAdminClient()
  const seo = admin.schema('seo')

  const { data: article } = await seo.from('articles')
    .select('id, status, topic_id, current_version_id').eq('id', articleId).single()
  if (!article) return { error: 'статья не найдена' }
  if (article.status !== 'approved' && !dryRun) return { error: 'сначала «Утвердить» — публикуем только прочитанное' }

  const { data: version } = await seo.from('article_versions')
    .select('id, title, meta').eq('id', article.current_version_id).single()
  const meta: any = version?.meta ?? {}
  if (!meta.cover?.base64) return { error: 'нет обложки карточки — без неё на /blog/ будет серый прямоугольник' }

  const { data: existing } = await seo.from('jobs').select('id')
    .eq('step', 'article_publish_blog').eq('article_id', articleId)
    .in('status', ['pending', 'running', 'waiting']).limit(1)
  if (existing?.length) return { error: 'публикация уже в очереди' }

  const { error } = await enqueueJob(seo, {
    step: 'article_publish_blog', lane: 'production', priority: 10, runner: 'agent',
    article_id: articleId, topic_id: article.topic_id,
    payload: { dry_run: dryRun, update },
  })
  if (error) return { error }

  revalidatePath(`/admin/seo/articles/${articleId}`)
  return {
    ok: true,
    note: dryRun
      ? 'План поставлен в очередь — агент покажет, какие файлы куда уедут.'
      : update
        ? 'Обновление поставлено в очередь: тот же адрес, тело перезапишется, дата первой публикации сохранится.'
        : 'Публикация поставлена в очередь. Агент выложит файлы в тему, бампнет сид-флаг и проверит страницу.',
  }
}


/** Ещё один круг починки по замечаниям — по кнопке, после двух автоматических (§12.2). */
export async function requestFix(articleId: number) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const admin = await createAdminClient()
  const seo = admin.schema('seo')

  const { data: existing } = await seo.from('jobs').select('id')
    .eq('step', 'article_fix').eq('article_id', articleId)
    .in('status', ['pending', 'running', 'waiting']).limit(1)
  if (existing?.length) return { error: 'починка уже в очереди' }

  const { data: article } = await seo.from('articles').select('topic_id').eq('id', articleId).single()
  const { error } = await seo.from('jobs').insert({
    step: 'article_fix', lane: 'production', priority: 30,
    article_id: articleId, topic_id: article?.topic_id ?? null, payload: {},
  })
  if (error) return { error: error.message }

  revalidatePath(`/admin/seo/articles/${articleId}`)
  return { ok: true, note: 'Починка в очереди: модель перепишет отмеченные места и отчёт обновится. Статус вернётся в «на вычитку».' }
}

/* ── Индексация ───────────────────────────────────────────────────────────── */

/** Отправить страницу в IndexNow: Яндекс, Bing, Seznam, Naver одним запросом. */
export async function submitForIndexing(articleId: number) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const admin = await createAdminClient()
  const seo = admin.schema('seo')

  const { data: article } = await seo.from('articles').select('status, current_version_id').eq('id', articleId).single()
  if (!article) return { error: 'статья не найдена' }
  if (article.status !== 'published') return { error: 'статья не опубликована — отправлять нечего' }

  const { data: version } = await seo.from('article_versions').select('id, meta').eq('id', article.current_version_id).single()
  const meta: any = version?.meta ?? {}
  const slug = meta.publish?.slug ?? meta.slug
  const url = `https://goandstudy.com/blog/${slug}/`

  const { submitToIndexNow } = await import('@/lib/seo/indexnow')
  const res = await submitToIndexNow([url])

  await seo.from('article_versions')
    .update({ meta: { ...meta, indexnow: { at: new Date().toISOString(), status: res.status, note: res.note } } })
    .eq('id', version?.id)

  revalidatePath(`/admin/seo/articles/${articleId}`)
  return res.ok
    ? { ok: true, note: `Отправлено в Яндекс, Bing, Seznam и Naver: ${res.note}. Google так уведомить нельзя — он придёт по sitemap.` }
    : { error: `IndexNow не принял: ${res.note}` }
}

/** Спросить Google, в индексе ли страница. Настоящий ответ Search Console. */
export async function checkIndex(articleId: number) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const admin = await createAdminClient()
  const seo = admin.schema('seo')

  const { data: article } = await seo.from('articles').select('status, current_version_id').eq('id', articleId).single()
  if (!article) return { error: 'статья не найдена' }

  const { data: version } = await seo.from('article_versions').select('id, meta').eq('id', article.current_version_id).single()
  const meta: any = version?.meta ?? {}
  const slug = meta.publish?.slug ?? meta.slug
  const url = `https://goandstudy.com/blog/${slug}/`

  const { inspectPage, saveIndexStatus } = await import('@/lib/seo/index-status')
  const v = await inspectPage(url)

  // Привязываем к странице инвентаря, если она уже обойдена краулером
  const { data: page } = await seo.from('pages').select('id').eq('normalized_url', url.replace(/\/$/, '')).maybeSingle()
  if (page?.id) await saveIndexStatus(seo, page.id, v)

  await seo.from('article_versions')
    .update({ meta: { ...meta, index_check: { at: new Date().toISOString(), verdict: v.verdict, coverage: v.coverageState, note: v.note, last_crawl: v.lastCrawl } } })
    .eq('id', version?.id)

  revalidatePath(`/admin/seo/articles/${articleId}`)
  return { ok: true, note: `Google: ${v.note}${v.lastCrawl ? `, последний обход ${String(v.lastCrawl).slice(0, 10)}` : ''}` }
}

/* ── Поток статей ─────────────────────────────────────────────────────────── */

export async function saveFlowSettings(next: {
  enabled: boolean; perWeek: number; maxInReview: number
  autoFix?: boolean; autoPublish?: boolean; publishPerDay?: number
}) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const seo = (await createAdminClient()).schema('seo')
  const { saveFlow, loadFlow } = await import('@/lib/seo/flow')
  // Дописываем к тому, что было: частичное сохранение не должно сбрасывать
  // настройки, которых не было в форме
  await saveFlow(seo, { ...(await loadFlow(seo)), ...next })
  revalidatePath('/admin/seo/articles')
  return { ok: true }
}

/** Не ждать ночного прохода — взять следующую тему прямо сейчас. */
export async function startNextNow() {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const seo = (await createAdminClient()).schema('seo')
  const { pickTopic } = await import('@/lib/seo/flow')

  const { topic, skipped } = await pickTopic(seo, { withSkipped: true })
  if (!topic) {
    return {
      error: skipped.length
        ? `свободных тем нет: ${skipped.length} отброшено из-за каннибализации (${skipped[0].query} — ${skipped[0].reason})`
        : 'свободных тем нет',
    }
  }

  const { error } = await seo.from('jobs').insert({
    step: 'article_brief', lane: 'production', priority: 50,
    topic_id: topic.id, payload: { topic_id: topic.id },
    dedup_key: `article:topic:${topic.id}:${Date.now()}`,
  })
  if (error) return { error: error.message }

  revalidatePath('/admin/seo/articles')
  return { ok: true, note: `«${topic.query}» в очереди` }
}

/* ── Решения по спорным темам ─────────────────────────────────────────────── */

/**
 * Что делать с темой, которую машина отложила из-за пересечения запросов.
 * Машина хорошо считает пересечение, но не знает намерения читателя — поэтому
 * последнее слово за человеком, и оно должно куда-то записываться.
 */
export async function decideTopic(
  topicId: number,
  action: 'create' | 'update' | 'review' | 'reject',
  targetUrl?: string,
) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const seo = (await createAdminClient()).schema('seo')

  const { data: topic } = await seo.from('topics').select('id, title, primary_keyword').eq('id', topicId).single()
  if (!topic) return { error: 'тема не найдена' }
  const name = topic.primary_keyword ?? topic.title

  if (action === 'create') {
    const { enqueueJob } = await import('@/lib/seo/enqueue')
    // force: человек посмотрел на конкурентов и решил — машине не переспрашивать
    const res = await enqueueJob(seo, {
      step: 'article_brief', lane: 'production', priority: 50, topic_id: topicId,
      payload: { topic_id: topicId, force: true, decided_by: 'human' },
      dedup_key: `article:topic:${topicId}:forced:${Date.now()}`,
    })
    if (res.error) return { error: res.error }
    await seo.from('topics').update({ status: 'in_production' }).eq('id', topicId)
    revalidatePath('/admin/seo/articles')
    return { ok: true, note: `«${name}» отправлена в работу вашим решением` }
  }

  if (action === 'update') {
    if (!targetUrl) return { error: 'не указана страница для обновления' }
    if (!/\/blog\//.test(targetUrl)) {
      // Страницы услуг живут не в теме, а в WordPress — их правка идёт другим
      // путём и отдельным решением
      await seo.from('topics').update({ status: 'needs_update' }).eq('id', topicId)
      return { ok: true, note: `Записано. ${targetUrl.replace('https://goandstudy.com', '')} — не статья блога, её правку согласуем отдельно.` }
    }

    const { enqueueJob } = await import('@/lib/seo/enqueue')
    const res = await enqueueJob(seo, {
      step: 'article_update_plan', lane: 'production', priority: 45, topic_id: topicId,
      payload: { url: targetUrl, query: name },
      dedup_key: `update:${targetUrl}`,
    })
    if (res.error) return { error: res.error }

    await seo.from('topics').update({ status: 'needs_update' }).eq('id', topicId)
    revalidatePath('/admin/seo/articles')
    return { ok: true, note: `Готовлю правку ${targetUrl.replace('https://goandstudy.com', '')}: снимок, предложение изменений, разница — придёт на вычитку.` }
  }

  if (action === 'review') {
    await seo.from('topics').update({ status: 'in_review' }).eq('id', topicId)
    revalidatePath('/admin/seo/articles')
    return { ok: true, note: `«${name}» отложена на рассмотрение` }
  }

  await seo.from('topics').update({ status: 'rejected_duplicate' }).eq('id', topicId)
  revalidatePath('/admin/seo/articles')
  return { ok: true, note: `«${name}» отклонена как дубль` }
}

/* ── Возврат прежней версии ───────────────────────────────────────────────── */

/**
 * Вернуть статью к выбранной версии.
 *
 * Не переписывает историю: создаёт новую версию с прежним телом. Так виден и
 * сам откат, и то, от чего откатились — иначе через месяц не понять, что
 * случилось. На сайт ничего не уходит: публикация остаётся отдельным решением.
 */
export async function revertToVersion(articleId: number, versionId: number) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const seo = (await createAdminClient()).schema('seo')

  const { data: source } = await seo.from('article_versions')
    .select('id, article_id, title, body, meta, version_no').eq('id', versionId).single()
  if (!source) return { error: 'версия не найдена' }
  if (source.article_id !== articleId) return { error: 'версия от другой статьи' }

  const { data: article } = await seo.from('articles').select('status, current_version_id').eq('id', articleId).single()
  if (article?.current_version_id === versionId) return { error: 'эта версия и так текущая' }

  const { data: last } = await seo.from('article_versions')
    .select('version_no').eq('article_id', articleId).order('version_no', { ascending: false }).limit(1)

  const { data: copy, error: insErr } = await seo.from('article_versions').insert({
    article_id: articleId,
    version_no: (last?.[0]?.version_no ?? 0) + 1,
    origin: 'human_edited',
    title: source.title,
    body: source.body,
    meta: { ...(source.meta ?? {}), reverted_from: versionId, reverted_at: new Date().toISOString() },
    created_by: user?.id ?? null,
  }).select('id').single()
  if (insErr) return { error: `не удалось создать версию: ${insErr.message}` }

  // Возврат снимает согласование: текст изменился, значит читать заново
  await seo.from('articles').update({
    current_version_id: copy.id,
    status: article?.status === 'published' ? 'published' : 'ready_for_review',
  }).eq('id', articleId)

  await seo.from('change_sets').insert({
    article_id: articleId, kind: 'revert',
    from_version: article?.current_version_id ?? null, to_version: copy.id,
    reason: `возврат к версии ${source.version_no} решением человека`,
    idempotency_key: `revert:${articleId}:${copy.id}`,
    status: 'applied', proposed_by: 'human',
  })

  revalidatePath(`/admin/seo/articles/${articleId}`)
  return {
    ok: true,
    note: article?.status === 'published'
      ? `Версия ${source.version_no} стала текущей. На сайте пока прежний текст — нажмите «Опубликовать» в режиме обновления.`
      : `Версия ${source.version_no} стала текущей.`,
  }
}

/** Перезапустить упавшую задачу: сбросить попытки и вернуть в очередь. */
export async function retryJob(jobId: number) {
  const { error: authErr } = await assertAdmin()
  if (authErr) return { error: authErr }
  const seo = (await createAdminClient()).schema('seo')

  const { data: job } = await seo.from('jobs').select('status, step').eq('id', jobId).single()
  if (!job) return { error: 'задача не найдена' }
  if (!['failed', 'cancelled'].includes(job.status)) return { error: `задача в состоянии «${job.status}» — перезапускать нечего` }

  const { error } = await seo.from('jobs').update({
    status: 'pending', attempts: 0, next_run_at: new Date().toISOString(),
    last_error: null, locked_at: null, locked_by: null,
  }).eq('id', jobId)
  if (error) return { error: error.message }

  revalidatePath('/admin/seo/articles')
  return { ok: true, note: `Задача «${job.step}» вернулась в очередь` }
}
