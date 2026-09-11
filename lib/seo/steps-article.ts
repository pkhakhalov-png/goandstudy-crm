// Производство статьи как цепочка шагов очереди, а не один длинный вызов.
//
// Почему цепочкой: seo.claim_jobs разблокирует задачу, висящую в running больше
// 10 минут, а полная генерация занимает дольше. Каждый шаг ниже укладывается в лимит,
// сам ставит следующий и виден в CRM отдельной строкой — видно, где конвейер встал.
//
//   article_brief → article_draft → article_qa → article_illustrate → article_linkplan
import { registerStep, type Job, type StepOutcome } from './steps'
import { generateBrief, generateDraft, reviseDraft, qaWithModel, qaDeterministic, GEN_MODEL, PROMPT_VERSION, type GenContext, type Brief, type QaReport } from './generate'
import { summarize } from './standard'
import { loadSiteTargets, normalizeBody } from './blog-style'
import { loadClaims, subjectKeysFor } from './claims'
import { publishToTheme, verifyPublished, listPublishedSlugs } from './theme-publish'
import fs from 'node:fs'
import os from 'node:os'
import nodePath from 'node:path'
import { renderBlogCover } from './cover'
import { planIncomingLinks, saveLinkPlan } from './linkplan'
import { embed } from './embeddings'
import { wp, wpConfigured } from './wp'
import { postPublishVerify, type PublishInput } from './publish'

const MAX_REVISIONS = 2   // §12.2

/* ── Общие загрузчики ─────────────────────────────────────────────────────── */

async function fetchAll(seo: any, table: string, cols: string, apply?: (q: any) => any): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += 500) {
    let q = seo.from(table).select(cols).range(from, from + 499)
    if (apply) q = apply(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < 500) break
  }
  return out
}

function vec(raw: any): number[] { return typeof raw === 'string' ? JSON.parse(raw) : raw }

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

async function buildContext(seo: any, topic: any): Promise<GenContext> {
  const kw = String(topic.primary_keyword || topic.title).toLowerCase()
  const stems = kw.split(/[^\p{L}\d]+/u).filter((w) => w.length >= 4).map((w) => w.slice(0, 5))

  const agg = new Map<string, { imp: number; clicks: number; pos: number; n: number; score: number }>()
  for (const r of await fetchAll(seo, 'gsc_daily', 'query,clicks,impressions,position')) {
    const q = String(r.query).toLowerCase()
    const score = stems.length ? stems.filter((st) => q.includes(st)).length / stems.length : 0
    if (score < 0.5) continue
    const a = agg.get(q) ?? { imp: 0, clicks: 0, pos: 0, n: 0, score }
    a.imp += r.impressions ?? 0; a.clicks += r.clicks ?? 0; a.pos += Number(r.position ?? 0); a.n++
    agg.set(q, a)
  }
  const queries = [...agg.entries()]
    .map(([query, a]) => ({ query, impressions: a.imp, clicks: a.clicks, position: a.pos / a.n, score: a.score }))
    .sort((a, b) => (b.score - a.score) || (b.impressions - a.impressions)).slice(0, 25)
    .map(({ query, impressions, clicks, position }) => ({ query, impressions, clicks, position }))

  const pages = await fetchAll(seo, 'pages', 'id,url,normalized_url,title,page_type,embedding',
    (q: any) => q.not('embedding', 'is', null).is('removed_at', null))
  const [topicVec] = await embed([`${topic.title}. ${queries.slice(0, 10).map((q) => q.query).join('. ')}`])

  const seen = new Set<string>()
  const near = pages
    .filter((p: any) => { const k = String(p.url).replace(/\/$/, ''); if (seen.has(k)) return false; seen.add(k); return true })
    .map((p: any) => ({ p, sim: cosine(topicVec, vec(p.embedding)) }))
    .sort((a, b) => b.sim - a.sim).slice(0, 20)
    .map(({ p }) => ({ id: p.id, url: p.url, title: p.title, page_type: p.page_type }))

  const exact: any[] = []
  for (const st of stems) {
    const { data } = await seo.from('pages').select('id,url,title,page_type').is('removed_at', null).ilike('title', `%${st}%`).limit(10)
    for (const p of data ?? []) if (!exact.some((e) => e.id === p.id)) exact.push(p)
  }
  const related: any[] = []
  for (const p of [...exact, ...near]) if (!related.some((e) => e.id === p.id)) related.push(p)

  // Факты под тему: без них цифр в статье быть не должно
  const claims = await loadClaims(seo, subjectKeysFor(`${topic.title} ${topic.primary_keyword ?? ''}`))

  // Тексты трёх ближайших страниц: чтобы не противоречить тому, что уже на сайте.
  // Именно из-за отсутствия этого статья написала «институты Конфуция», хотя
  // на соседней странице куратор уже поправил название программы.
  const neighbourTexts: { url: string; title: string | null; text: string }[] = []
  for (const p of related.slice(0, 3)) {
    const text = await fetchPageText(p.url)
    if (text) neighbourTexts.push({ url: p.url, title: p.title, text })
  }

  return {
    topicTitle: topic.title,
    primaryKeyword: topic.primary_keyword || topic.title,
    cluster: topic.cluster ?? null,
    claims, neighbourTexts,
    related, queries,
  }
}

async function fetchPageText(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { 'User-Agent': 'goandstudy-seo' }, signal: AbortSignal.timeout(20000) }).catch(() => null)
  if (!res || !res.ok) return null
  const html = await res.text()
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    .slice(0, 6000)
}

async function siteStrings(seo: any) {
  const knownUrls = new Set<string>(); const existingTitles = new Set<string>()
  const existingDescriptions = new Set<string>(); const existingSlugs = new Set<string>()
  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').replace(/[«»"'’]/g, '').trim()
  for (const p of await fetchAll(seo, 'pages', 'url,normalized_url,title,meta_desc', (q: any) => q.is('removed_at', null))) {
    knownUrls.add(String(p.url).replace(/\/$/, '')); knownUrls.add(String(p.normalized_url).replace(/\/$/, ''))
    if (p.title) existingTitles.add(norm(String(p.title)))
    if (p.meta_desc) existingDescriptions.add(norm(String(p.meta_desc)))
    const seg = String(p.normalized_url).replace(/\/$/, '').split('/').pop(); if (seg) existingSlugs.add(seg)
  }
  return { knownUrls, existingTitles, existingDescriptions, existingSlugs }
}

async function pageEmbeddings(seo: any) {
  return (await fetchAll(seo, 'pages', 'url,title,embedding', (q: any) => q.not('embedding', 'is', null).is('removed_at', null)))
    .map((p: any) => ({ url: p.url, title: p.title, vec: vec(p.embedding) }))
}

function next(seo: any, step: string, articleId: number, topicId: number, payload: any = {}) {
  return seo.from('jobs').insert({ step, lane: 'production', priority: 50, article_id: articleId, topic_id: topicId, payload })
}

/* ── Шаг 1: тема → бриф → черновик статьи в БД ────────────────────────────── */

registerStep('article_brief', async (job: Job, seo: any): Promise<StepOutcome> => {
  const topicId = job.topic_id ?? job.payload.topic_id
  const query = job.payload.query as string | undefined
  let topic: any

  if (topicId) {
    const { data } = await seo.from('topics').select('id,title,primary_keyword,cluster').eq('id', topicId).single()
    topic = data
  } else if (query) {
    const { data, error } = await seo.from('topics')
      .insert({ title: query, primary_keyword: query, origin: 'manual', status: 'in_production' })
      .select('id,title,primary_keyword,cluster').single()
    if (error) return { outcome: 'failed', result: { error: `создание темы: ${error.message}` } }
    topic = data
  }
  if (!topic) return { outcome: 'failed', result: { error: 'нет темы: нужен topic_id или query' } }

  // Стоп-кран перед записью. Проверка стоит именно здесь, а не только при выборе
  // темы: тему можно задать руками, а деньги тратятся начиная со следующего шага.
  // Пропуск возможен явным флагом — на случай, когда решение принято осознанно.
  if (!job.payload?.force) {
    const { checkCannibalization, sameFamily } = await import('./cannibal')
    const query = topic.primary_keyword ?? topic.title

    // Своя же статья про то же самое, только другими словами
    const { data: mine } = await seo.from('articles').select('id, primary_keyword').neq('status', 'rejected')
    const twin = (mine ?? []).find((r: any) => r.primary_keyword && sameFamily(r.primary_keyword, query))
    if (twin) {
      await seo.from('topics').update({ status: 'rejected_duplicate' }).eq('id', topic.id)
      return {
        outcome: 'done',
        result: { skipped: true, verdict: 'duplicate', reason: `то же самое другими словами — статья #${twin.id} «${twin.primary_keyword}»`, cost: 0 },
      }
    }

    const v = await checkCannibalization(seo, query)
    if (v.verdict !== 'safe') {
      await seo.from('topics').update({ status: 'rejected_duplicate' }).eq('id', topic.id)
      return {
        outcome: 'done',
        result: {
          skipped: true, verdict: v.verdict, reason: v.reason,
          update_instead: v.updateTarget,
          owners: v.owners.slice(0, 3).map((o: any) => `${Math.round(o.share * 100)}% ${o.url}`),
          cost: 0,
        },
      }
    }
  }

  const ctx = await buildContext(seo, topic)
  const brief: Brief = await generateBrief(ctx)

  const { data: article, error: aerr } = await seo.from('articles')
    .insert({ topic_id: topic.id, primary_keyword: brief.primary_keyword, status: 'in_production' })
    .select('id').single()
  if (aerr) return { outcome: 'failed', result: { error: `articles: ${aerr.message}` } }

  await seo.from('topics').update({ status: 'in_production' }).eq('id', topic.id)
  await next(seo, 'article_draft', article.id, topic.id, { brief, ctx })
  return { outcome: 'done', result: { article_id: article.id, title: brief.title, unique_value: brief.unique_value, cost: 0 } }
})

/* ── Шаг 2: черновик ──────────────────────────────────────────────────────── */

registerStep('article_draft', async (job: Job, seo: any): Promise<StepOutcome> => {
  const { brief, ctx } = job.payload as { brief: Brief; ctx: GenContext }
  const articleId = job.article_id!
  const html = normalizeBody(await generateDraft(ctx, brief))

  const { data: v, error } = await seo.from('article_versions').insert({
    article_id: articleId, version_no: 1, origin: 'generated',
    title: brief.title, body: html,
    meta: { description: brief.meta_description, slug: brief.slug, brief },
    prompt_version: PROMPT_VERSION, model: GEN_MODEL,
  }).select('id').single()
  if (error) return { outcome: 'failed', result: { error: `article_versions: ${error.message}` } }

  await seo.from('articles').update({ current_version_id: v.id }).eq('id', articleId)
  await next(seo, 'article_qa', articleId, job.topic_id!, { brief, ctx, attempt: 0 })
  return { outcome: 'done', result: { version_id: v.id, chars: html.length, cost: 0 } }
})

/* ── Шаг 3: QA и починка. Один прогон за задачу — иначе не влезаем в 10 минут ─ */

registerStep('article_qa', async (job: Job, seo: any): Promise<StepOutcome> => {
  const { brief, ctx, attempt } = job.payload as { brief: Brief; ctx: GenContext; attempt: number }
  const articleId = job.article_id!

  const { data: article } = await seo.from('articles').select('current_version_id').eq('id', articleId).single()
  const { data: version } = await seo.from('article_versions').select('id,version_no,body,meta').eq('id', article.current_version_id).single()
  const html = String(version.body)

  const det = await qaDeterministic(ctx, brief, html, {
    pageEmbeddings: await pageEmbeddings(seo),
    ...(await loadSiteTargets(seo)),
    category: (brief as any).category,
  })
  const modelIssues = await qaWithModel(ctx, brief, html)
  const { failedB, verdict } = summarize(det.checks)
  const blockingIssues = modelIssues.filter((i) => i.severity === 'blocker')
  const report: QaReport = {
    checks: det.checks,
    issues: [...det.issues.filter((i) => i.kind !== 'structure'), ...modelIssues],
    verdict: verdict as QaReport['verdict'],
  }
  await seo.from('article_versions').update({ qa_report: report, qa_version: 'v1' }).eq('id', version.id)

  const needFix = failedB.length > 0 || blockingIssues.length > 0
  if (!needFix) {
    await seo.from('articles').update({ status: 'ready_for_review' }).eq('id', articleId)
    await next(seo, 'article_cover', articleId, job.topic_id!, { brief, ctx })
    return { outcome: 'done', result: { verdict: 'ready_for_review', checks_failed: 0, issues: report.issues.length, cost: 0 } }
  }

  if (attempt >= MAX_REVISIONS) {
    // §12.2: две попытки — и дальше решает человек, а не машина по кругу
    await seo.from('articles').update({ status: 'ready_for_review' }).eq('id', articleId)
    await next(seo, 'article_cover', articleId, job.topic_id!, { brief, ctx })
    return { outcome: 'done', result: { verdict: 'needs_human', checks_failed: failedB.length, issues: report.issues.length, cost: 0 } }
  }

  const fixed = await reviseDraft(ctx, brief, html, failedB.map((c) => ({ id: c.id, detail: c.detail })), modelIssues)
  const { data: nv, error } = await seo.from('article_versions').insert({
    article_id: articleId, version_no: (version.version_no ?? 1) + 1, origin: 'qa_fixed',
    title: brief.title, body: fixed, meta: version.meta,
    prompt_version: PROMPT_VERSION, model: GEN_MODEL,
  }).select('id').single()
  if (error) return { outcome: 'failed', result: { error: `article_versions: ${error.message}` } }
  await seo.from('articles').update({ current_version_id: nv.id }).eq('id', articleId)

  await next(seo, 'article_qa', articleId, job.topic_id!, { brief, ctx, attempt: attempt + 1 })
  return { outcome: 'done', result: { verdict: 'revised', attempt: attempt + 1, checks_failed: failedB.length, cost: 0 } }
})

/* ── Шаг 4: обложка карточки ──────────────────────────────────────────────── */

/**
 * Схем внутри текста у блога не бывает: wp:image в теме не стилизован, картинка
 * отрендерится голым HTML. Поэтому шаг делает только обложку карточки — 480×320
 * JPEG без текста и логотипов, как требует стандарт.
 *
 * Файл кладём в мету версии base64: воркер может крутиться на Vercel, где нет
 * постоянного диска, а при публикации обложка всё равно уезжает на сервер темы.
 */
registerStep('article_cover', async (job: Job, seo: any): Promise<StepOutcome> => {
  const articleId = job.article_id!
  const { data: article } = await seo.from('articles').select('current_version_id').eq('id', articleId).single()
  const { data: version } = await seo.from('article_versions').select('id, title, body, meta').eq('id', article.current_version_id).single()
  const meta: any = version.meta ?? {}
  const slug: string = meta.slug ?? `article-${articleId}`

  const { imagesConfigured } = await import('./images')

  // Заглушка — запасной путь. Кончился баланс у поставщика, отвалилась сеть,
  // модель вернула мусор — статья всё равно выходит, просто с прежней обложкой.
  // Останавливать конвейер из-за картинки нельзя.
  const fallback = async (why: string): Promise<StepOutcome> => {
    const cover = await renderBlogCover(slug)
    await seo.from('article_versions').update({
      meta: { ...meta, cover: { format: 'jpeg', width: cover.width, height: cover.height, bytes: cover.bytes, base64: cover.buffer.toString('base64'), placeholder: true } },
    }).eq('id', version.id)
    await next(seo, 'article_linkplan', articleId, job.topic_id!, { brief: job.payload.brief })
    return { outcome: 'done', result: { cover: `${cover.width}×${cover.height}`, placeholder: true, why, cost: 0 } }
  }

  if (!imagesConfigured()) return fallback('нет ключа поставщика картинок')

  const { generateCover, generateInline, coverPrompt, inlinePrompt, figureBlock } = await import('./images')
  const { planScenes } = await import('./generate')
  const { splitBlocks } = await import('./blog-style')

  const body: string = version.body ?? ''
  const headings = [...body.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean)

  let scenes: Awaited<ReturnType<typeof planScenes>>
  let cover: Awaited<ReturnType<typeof generateCover>>
  let inline: Awaited<ReturnType<typeof generateInline>>
  try {
    scenes = await planScenes({
      title: version.title ?? slug,
      h1: job.payload?.brief?.h1 ?? version.title ?? slug,
      headings,
    })
    cover = await generateCover(coverPrompt(scenes.cover))
    inline = await generateInline(inlinePrompt(scenes.inline))
  } catch (e: any) {
    return fallback(`картинки не нарисовались: ${String(e?.message ?? e).slice(0, 120)}`)
  }

  // Вставляем картинку после раздела, который выбрала модель. Если такого
  // подзаголовка в тексте нет — ставим в середину, а не теряем картинку.
  const blocks = splitBlocks(body)
  const target = blocks.findIndex((b) => b.includes('wp:heading') && b.includes(scenes.after_heading.slice(0, 40)))
  let at = target >= 0 ? nextSectionEnd(blocks, target) : Math.floor(blocks.length / 2)
  at = Math.min(Math.max(at, 1), blocks.length - 1)

  const src = `/wp-content/themes/goandstudy/assets/img/blog/${slug}-1.jpg`
  blocks.splice(at, 0, figureBlock(src, scenes.inline_alt))

  await seo.from('article_versions').update({
    body: blocks.join('\n\n'),
    meta: {
      ...meta,
      cover: { format: 'jpeg', width: cover.width, height: cover.height, bytes: cover.bytes, base64: cover.buffer.toString('base64') },
      images: {
        ...(meta.images ?? {}),
        scenes,
        inline: [{ name: `${slug}-1.jpg`, src, alt: scenes.inline_alt, width: inline.width, height: inline.height, bytes: inline.bytes, base64: inline.buffer.toString('base64') }],
      },
    },
  }).eq('id', version.id)

  await next(seo, 'article_linkplan', articleId, job.topic_id!, { brief: job.payload.brief })
  return {
    outcome: 'done',
    result: {
      cover: `${cover.width}×${cover.height}`, kb: Math.round(cover.bytes / 102.4) / 10,
      inline: `${inline.width}×${inline.height}`, after: target >= 0 ? scenes.after_heading : 'середина текста',
      cost: 0,
    },
  }
})

/** Конец раздела: следующий подзаголовок того же уровня или конец статьи. */
function nextSectionEnd(blocks: string[], headingIndex: number): number {
  for (let i = headingIndex + 1; i < blocks.length; i++) {
    if (blocks[i].includes('wp:heading')) return i
  }
  return blocks.length
}

/* ── Шаг 5: план входящих ссылок ──────────────────────────────────────────── */

registerStep('article_linkplan', async (job: Job, seo: any): Promise<StepOutcome> => {
  const { brief } = job.payload as { brief: Brief }
  const articleId = job.article_id!

  const pages = (await fetchAll(seo, 'pages', 'id,url,normalized_url,title,embedding,h1,meta_desc',
    (q: any) => q.not('embedding', 'is', null).is('removed_at', null)))
    .filter((p: any) => String(p.url).replace(/\/$/, '') === String(p.normalized_url).replace(/\/$/, ''))
    .map((p: any) => ({ id: p.id, url: p.url, title: p.title, vec: vec(p.embedding), text: [p.title, p.h1, p.meta_desc].filter(Boolean).join('. ') }))

  const donors = await planIncomingLinks({
    targetTitle: brief.title, targetH1: brief.h1, targetSlug: brief.slug,
    anchorCandidates: [brief.h1, brief.primary_keyword, ...(brief.secondary_keywords ?? [])],
    pages, alreadyLinking: new Set(), min: 2,
    // Ищем фразу там же, где потом будем править. Раньше план смотрел на
    // отрендеренную страницу вместе с меню и подвалом, а вставка — на исходный
    // текст записи: план находил фразу, вставка её не видела.
    fetchText: async (url) => {
      if (!url.includes('/blog/') && wpConfigured()) {
        const resolved = await wp.resolve(url).catch(() => null)
        if (resolved?.found && resolved.post_id) {
          const post = await wp.post(resolved.post_id).catch(() => null)
          if (post) return String(post.content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        }
      }
      const res = await fetch(url, { headers: { 'User-Agent': 'goandstudy-seo-linkplan' }, signal: AbortSignal.timeout(20000) }).catch(() => null)
      if (!res || !res.ok) return null
      const html = await res.text()
      return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>/gi, ' ')
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    },
  })
  await saveLinkPlan(seo, donors, { topicId: job.topic_id!, pageId: null })
  await seo.from('topics').update({ status: 'produced' }).eq('id', job.topic_id!)

  const ready = donors.filter((d) => d.status === 'proposed').length
  return { outcome: 'done', result: { donors: donors.length, ready, orphan_risk: ready < 2, cost: 0 } }
})

/* ── Кандидаты в статьи: считаем один раз, а не на каждой отрисовке экрана ── */

/**
 * Запросы с показами, где сайт ниже десятого места, складываются в seo.topics.
 * Раньше экран «Статьи» считал это сам и вытягивал 152 тысячи строк GSC на каждый
 * рендер. Теперь считает шаг очереди, а экран читает готовые темы.
 */
registerStep('topics_from_gsc', async (_job: Job, seo: any): Promise<StepOutcome> => {
  const agg = new Map<string, { imp: number; clicks: number; pos: number; n: number; url: string }>()
  for (const r of await fetchAll(seo, 'gsc_daily', 'normalized_url,query,clicks,impressions,position')) {
    const q = String(r.query).toLowerCase().trim()
    if (!q) continue
    const a = agg.get(q) ?? { imp: 0, clicks: 0, pos: 0, n: 0, url: String(r.normalized_url) }
    a.imp += r.impressions ?? 0; a.clicks += r.clicks ?? 0; a.pos += Number(r.position ?? 0); a.n++
    agg.set(q, a)
  }

  const existing = new Set<string>()
  for (const t of await fetchAll(seo, 'topics', 'title,primary_keyword')) {
    existing.add(String(t.primary_keyword ?? t.title).toLowerCase().trim())
  }

  const candidates = [...agg.entries()]
    .map(([query, a]) => ({ query, impressions: a.imp, clicks: a.clicks, position: a.pos / a.n, url: a.url }))
    // Ниже десятого места и с заметным спросом: значит подходящей страницы нет
    .filter((c) => c.position > 10 && c.impressions >= 150 && !existing.has(c.query))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 60)

  if (!candidates.length) return { outcome: 'done', result: { inserted: 0, cost: 0 } }

  const rows = candidates.map((c) => ({
    title: c.query,
    primary_keyword: c.query,
    origin: 'gsc_gap',
    status: 'new',
    search_volume: c.impressions,
    // Приоритет: показы, приглушённые глубиной позиции — чем дальше, тем нужнее страница
    priority: Math.round(c.impressions * Math.min(1, c.position / 30)),
  }))
  const { error } = await seo.from('topics').insert(rows)
  if (error) return { outcome: 'failed', result: { error: `topics: ${error.message}` } }

  return { outcome: 'done', result: { inserted: rows.length, top: candidates[0]?.query, cost: 0 } }
})


/* ── Шаг 6: проверка опубликованной страницы глазами бота (§12) ───────────── */

/**
 * Ставится с задержкой после публикации. Раньше это ждали прямо в кнопке CRM,
 * но 60 секунд ожидания внутри веб-запроса — верный способ получить обрыв:
 * страница опубликована, а проверка и откат не отработали.
 */
registerStep('article_verify', async (job: Job, seo: any): Promise<StepOutcome> => {
  const articleId = job.article_id!
  const postId = job.payload.post_id as number
  if (!wpConfigured()) return { outcome: 'failed', result: { error: 'нет доступа к мосту' } }

  const { data: article } = await seo.from('articles').select('current_version_id, status').eq('id', articleId).single()
  const { data: version } = await seo.from('article_versions').select('title, body, meta').eq('id', article.current_version_id).single()
  const meta: any = version.meta ?? {}
  const brief: any = meta.brief ?? {}
  const slug: string = meta.publish?.slug ?? meta.slug

  const payload: PublishInput = {
    articleId, versionId: article.current_version_id,
    title: version.title ?? '', h1: brief.h1 ?? version.title ?? '',
    description: meta.description ?? '', slug,
    html: version.body ?? '', primaryKeyword: '',
    imageUrl: meta.images?.cover?.url ?? null, author: null, breadcrumbs: [],
  }

  const verify = await postPublishVerify(postId, payload)
  if (!verify.ok) {
    // Битую страницу в индексе не оставляем: возвращаем в черновик и зовём человека
    await wp.patchPost(postId, { status: 'draft', idempotency_key: `rollback:${articleId}` })
    await seo.from('articles').update({ status: 'ready_for_review', published_at: null }).eq('id', articleId)
    await seo.from('change_sets').insert({
      article_id: articleId, kind: 'new_article',
      reason: `откат: проверка после публикации нашла критичное — ${verify.critical.join('; ')}`,
      idempotency_key: `rollback:${articleId}:${job.id}`, status: 'rolled_back', proposed_by: 'system',
    })
    return { outcome: 'done', result: { rolled_back: true, critical: verify.critical, cost: 0 } }
  }

  await seo.from('change_sets').update({ verified_at: new Date().toISOString() })
    .eq('article_id', articleId).eq('kind', 'new_article').eq('status', 'applied').is('verified_at', null)
  return { outcome: 'done', result: { ok: true, warnings: verify.warnings, cost: 0 } }
})


/* ── Шаг 6: публикация в блог по устройству темы ──────────────────────────── */

/**
 * Требует SSH к серверу: тема принадлежит root и для PHP закрыта. Воркер без
 * ключа честно падает с понятной причиной, а не делает вид, что опубликовал.
 */
registerStep('article_publish_blog', async (job: Job, seo: any): Promise<StepOutcome> => {
  const articleId = job.article_id!
  const dryRun = job.payload?.dry_run !== false

  const { data: article } = await seo.from('articles').select('current_version_id, status').eq('id', articleId).single()
  const { data: version } = await seo.from('article_versions').select('id, title, body, meta').eq('id', article.current_version_id).single()
  const meta: any = version.meta ?? {}
  const brief: any = meta.brief ?? {}
  const slug: string = meta.slug

  if (!meta.cover?.base64) return { outcome: 'failed', result: { error: 'нет обложки карточки' } }

  const today = new Date().toISOString().slice(0, 10)
  const entry = {
    slug,
    title: String(version.title ?? ''),
    excerpt: String(meta.description ?? ''),
    cat: String(brief.category ?? ''),
    published: today,
    updated: today,
  }

  const tmp = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'gs-blog-'))
  const bodyPath = nodePath.join(tmp, `${slug}.html`)
  const coverPath = nodePath.join(tmp, `${slug}.jpg`)
  fs.writeFileSync(bodyPath, String(version.body ?? '').trimEnd() + '\n')
  fs.writeFileSync(coverPath, Buffer.from(meta.cover.base64, 'base64'))

  try {
    const report = await publishToTheme(entry, { bodyPath, coverPath }, { dryRun })
    if (dryRun) return { outcome: 'done', result: { dry_run: true, ...report, cost: 0 } }

    await seo.from('articles').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', articleId)
    await seo.from('article_versions').update({ meta: { ...meta, publish: { path: `/blog/${slug}/`, seed: report.seedTo, at: new Date().toISOString() } } }).eq('id', version.id)
    await seo.from('change_sets').insert({
      article_id: articleId, kind: 'new_article',
      reason: `публикация в блог: тело, обложка, реестр, сид-флаг ${report.seedFrom} → ${report.seedTo}`,
      idempotency_key: `blogpublish:${version.id}`, status: 'applied', proposed_by: 'human',
      applied_at: new Date().toISOString(),
    })

    // Ссылки на статью теперь ведут на существующую страницу
    if (job.topic_id) {
      await seo.from('link_suggestions').update({ status: 'proposed' })
        .eq('to_topic_id', job.topic_id).eq('status', 'waiting_target')
    }

    const verify = await verifyPublished(slug)
    return { outcome: 'done', result: { url: report.url, verify_ok: verify.ok, checks: verify.results, cost: 0 } }
  } catch (e: any) {
    // Сеть отвалилась или сервер занят — это повод повторить, а не хоронить статью
    const { outcomeFor } = await import('./failure')
    return outcomeFor(e)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})


/* ── Ручная починка по замечаниям ─────────────────────────────────────────── */

/**
 * Отдельный шаг под кнопку «Исправить замечания». Автоматических попыток по §12.2
 * всего две, дальше решает человек — но если он посмотрел и хочет ещё круг,
 * не надо перегенерировать статью с нуля.
 */
registerStep('article_fix', async (job: Job, seo: any): Promise<StepOutcome> => {
  const articleId = job.article_id!

  const { data: article } = await seo.from('articles').select('current_version_id, topic_id').eq('id', articleId).single()
  const { data: version } = await seo.from('article_versions')
    .select('id, version_no, title, body, meta, qa_report').eq('id', article.current_version_id).single()
  const meta: any = version.meta ?? {}
  const brief: Brief = meta.brief
  if (!brief) return { outcome: 'failed', result: { error: 'у версии нет брифа' } }

  const { data: topic } = await seo.from('topics').select('id,title,primary_keyword,cluster').eq('id', article.topic_id).single()
  const ctx = await buildContext(seo, topic)

  const html = String(version.body)
  const det = await qaDeterministic(ctx, brief, html, {
    pageEmbeddings: await pageEmbeddings(seo),
    ...(await loadSiteTargets(seo)),
    category: brief.category,
  })
  const modelIssues = await qaWithModel(ctx, brief, html)
  const { failedB } = summarize(det.checks)

  // Чинить нечего — не плодим версию впустую
  const worth = [...modelIssues.filter((i) => i.severity !== 'minor'), ...det.issues]
  if (!failedB.length && worth.length === 0) {
    return { outcome: 'done', result: { nothing_to_fix: true, cost: 0 } }
  }

  const fixed = normalizeBody(await reviseDraft(ctx, brief, html, failedB.map((c) => ({ id: c.id, detail: c.detail })), modelIssues))

  const { data: nv, error } = await seo.from('article_versions').insert({
    article_id: articleId, version_no: (version.version_no ?? 1) + 1, origin: 'qa_fixed',
    title: version.title, body: fixed, meta,
    prompt_version: PROMPT_VERSION, model: GEN_MODEL,
  }).select('id').single()
  if (error) return { outcome: 'failed', result: { error: `article_versions: ${error.message}` } }

  // Перепроверяем уже исправленный текст, чтобы отчёт относился к нему, а не к прошлому
  const det2 = await qaDeterministic(ctx, brief, fixed, {
    pageEmbeddings: await pageEmbeddings(seo),
    ...(await loadSiteTargets(seo)),
    category: brief.category,
  })
  const modelIssues2 = await qaWithModel(ctx, brief, fixed)
  const sum2 = summarize(det2.checks)
  await seo.from('article_versions').update({
    qa_report: {
      checks: det2.checks,
      issues: [...det2.issues.filter((i) => i.kind !== 'structure'), ...modelIssues2],
      verdict: sum2.verdict,
    },
    qa_version: 'v1',
  }).eq('id', nv.id)

  await seo.from('articles').update({ current_version_id: nv.id, status: 'ready_for_review' }).eq('id', articleId)

  return {
    outcome: 'done',
    result: {
      version_id: nv.id,
      было: { блокеры: failedB.length, замечания: modelIssues.length },
      стало: { блокеры: sum2.failedB.length, замечания: modelIssues2.length },
      cost: 0,
    },
  }
})


/* ── Шаг 8: проверка индексации ───────────────────────────────────────────── */

/**
 * Спрашивает Search Console про опубликованные статьи и запоминает ответ.
 * Ставится раз в сутки, поэтому момент попадания в индекс ловится сам —
 * нажимать кнопку каждый день не нужно. Квота метода 2000 адресов в сутки,
 * до неё нам далеко, но перепроверяем только те, чей срок подошёл.
 */
registerStep('article_index_check', async (job: Job, seo: any): Promise<StepOutcome> => {
  const { inspectPage, saveIndexStatus } = await import('./index-status')

  const { data: articles } = await seo.from('articles')
    .select('id, current_version_id, indexed_at').eq('status', 'published').order('id')
  if (!articles?.length) return { outcome: 'done', result: { checked: 0, cost: 0 } }

  let checked = 0
  const indexed: number[] = []

  for (const a of articles as any[]) {
    const { data: version } = await seo.from('article_versions').select('id, meta').eq('id', a.current_version_id).single()
    const meta: any = version?.meta ?? {}
    const slug = meta.publish?.slug ?? meta.slug
    if (!slug) continue

    // Уже в индексе и проверено недавно — не тратим квоту
    const last = meta.index_check?.at ? Date.parse(meta.index_check.at) : 0
    const wait = meta.index_check?.verdict === 'PASS' ? 14 * 864e5 : 2 * 864e5
    if (Date.now() - last < wait) continue

    const url = `https://goandstudy.com/blog/${slug}/`
    const res = await inspectPage(url)
    if (!res.checked) break // нет доступа или кончилась квота — остальные тем более не пройдут
    checked++

    const { data: page } = await seo.from('pages').select('id').eq('normalized_url', url.replace(/\/$/, '')).maybeSingle()
    if (page?.id) await saveIndexStatus(seo, page.id, res)

    await seo.from('article_versions').update({
      meta: { ...meta, index_check: { at: new Date().toISOString(), verdict: res.verdict, coverage: res.coverageState, note: res.note, last_crawl: res.lastCrawl } },
    }).eq('id', version!.id)

    if (res.verdict === 'PASS' && !a.indexed_at) {
      await seo.from('articles').update({ indexed_at: new Date().toISOString() }).eq('id', a.id)
      indexed.push(a.id)
    }
  }

  return { outcome: 'done', result: { checked, newly_indexed: indexed, cost: 0 } }
})


/**
 * Обход сайта: проверяем индексацию страниц, чей срок подошёл. Порция за раз,
 * остаток доберётся следующим тиком — так шаг укладывается в бюджет воркера.
 */
registerStep('index_check_site', async (_job: Job, seo: any): Promise<StepOutcome> => {
  const { checkSiteIndexation } = await import('./index-status')
  const res = await checkSiteIndexation(seo, { limit: 60 })

  // Осталось непроверенное — ставим продолжение, а не бросаем на середине
  if (res.checked >= 60) {
    await seo.from('jobs').insert({ step: 'index_check_site', lane: 'findings', priority: 95, payload: {} })
  }
  return { outcome: 'done', result: { checked: res.checked, stopped: res.stopped ?? null, cost: 0 } }
})


/**
 * Автозапуск статьи по расписанию. Ставится в суточный цикл; сам решает,
 * пора ли, и молча ничего не делает, если норма выбрана или очередь на
 * вычитку переполнена.
 */
registerStep('article_autostart', async (_job: Job, seo: any): Promise<StepOutcome> => {
  const { flowState, markAutoRun, saveSnapshot } = await import('./flow')
  const st = await flowState(seo)
  // Экран показывает именно этот расчёт — сам он его делать не должен
  await saveSnapshot(seo, st)

  if (st.blocker || !st.nextTopic) {
    return { outcome: 'done', result: { started: false, why: st.blocker ?? 'нет темы', cost: 0 } }
  }

  await seo.from('jobs').insert({
    step: 'article_brief', lane: 'production', priority: 40,
    topic_id: st.nextTopic.id,
    payload: { topic_id: st.nextTopic.id, auto: true },
    dedup_key: `article:topic:${st.nextTopic.id}:auto`,
  })
  await markAutoRun(seo)

  return {
    outcome: 'done',
    result: {
      started: true, topic: st.nextTopic.query,
      week: `${st.startedThisWeek + 1}/${st.settings.perWeek}`,
      safe_because: st.nextTopic.cannibalReason,
      skipped: st.skipped.length,
      cost: 0,
    },
  }
})


/**
 * Сшивка обращений с продажами. Отдельным шагом, потому что сделка появляется
 * позже записи на консультацию, а иногда и вручную.
 */
registerStep('attribution_stitch', async (_job: Job, seo: any): Promise<StepOutcome> => {
  const { stitchDeals } = await import('./attribution')
  const { createAdminClient } = await import('@/lib/supabase/server')
  const sb = await createAdminClient()
  const res = await stitchDeals(seo, sb)
  return { outcome: 'done', result: { ...res, cost: 0 } }
})
