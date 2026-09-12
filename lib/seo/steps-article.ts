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


/* ── Обновление вышедшей статьи ───────────────────────────────────────────── */

/**
 * Готовит правку существующей статьи, а не пишет новую.
 *
 * Порядок такой: снимок того, что сейчас на сайте → поиск устаревшего и
 * пробелов → предложение правок отдельной версией → человек смотрит разницу
 * и решает. Публикация идёт прежним путём в режиме обновления, поэтому адрес
 * сохраняется, а откат остаётся возможен.
 *
 * Целиком статью не переписываем: работающий текст — ценность, которую легко
 * потерять ради красоты.
 */
registerStep('article_update_plan', async (job: Job, seo: any): Promise<StepOutcome> => {
  const url = String(job.payload?.url ?? '')
  const slug = url.replace(/\/$/, '').split('/').pop() ?? ''
  if (!/^[a-z0-9-]+$/.test(slug)) return { outcome: 'failed', result: { error: `не разобрать адрес: ${url}` } }

  const { readThemeArticle, readThemeCover } = await import('./theme-publish')
  const current = await readThemeArticle(slug)
  if (!current) return { outcome: 'failed', result: { error: `статьи ${slug} нет в теме — обновлять нечего` } }

  // Статья могла быть написана до конвейера: тогда заводим для неё запись,
  // чтобы у правки была история версий и согласование
  let articleId = job.article_id as number | null
  if (!articleId) {
    const { data: existing } = await seo.from('articles')
      .select('id').eq('topic_id', job.topic_id ?? -1).maybeSingle()
    articleId = existing?.id ?? null
  }
  if (!articleId) {
    const { data: created, error } = await seo.from('articles')
      .insert({ topic_id: job.topic_id ?? null, primary_keyword: job.payload?.query ?? slug, status: 'in_production' })
      .select('id').single()
    if (error) return { outcome: 'failed', result: { error: `создание записи статьи: ${error.message}` } }
    articleId = created.id
  }

  // Снимок: что было до правки. Без него нельзя ни сравнить, ни вернуть
  const title = current.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? slug

  // Номер версии обязателен и уникален в рамках статьи
  const { data: last } = await seo.from('article_versions')
    .select('version_no').eq('article_id', articleId).order('version_no', { ascending: false }).limit(1)
  let versionNo = (last?.[0]?.version_no ?? 0) + 1

  const { data: snapshot, error: snapErr } = await seo.from('article_versions').insert({
    article_id: articleId, version_no: versionNo++, origin: 'human_edited', title, body: current,
    meta: { slug, snapshot: true, taken_at: new Date().toISOString(), reason: 'состояние до обновления' },
  }).select('id').single()
  // Снимок — основа отката. Без него продолжать нельзя: сравнивать будет не с чем
  if (snapErr) return { outcome: 'failed', result: { error: `снимок статьи: ${snapErr.message}` } }

  // Что чинить: проверки стандарта и ворота достоверности по текущему тексту
  const { checkBlogStandard, loadSiteTargets } = await import('./blog-style')
  const targets = await loadSiteTargets(seo).catch(() => ({ knownBlogSlugs: new Set<string>(), knownPagePaths: new Set<string>() }))
  const checks = checkBlogStandard({
    body: current, title, excerpt: '', slug, category: '',
    knownBlogSlugs: targets.knownBlogSlugs, knownPagePaths: targets.knownPagePaths,
  })
  const failed = checks.filter((c) => !c.ok && c.level === 'B')

  const { factGate } = await import('./fact-gate')
  const { subjectKeysFor } = await import('./claims')
  const gate = await factGate(seo, current, subjectKeysFor(`${title} ${slug}`))

  const issues = [
    ...failed.map((c: any) => ({ id: c.id, detail: c.detail ?? '' })),
    ...gate.blocking.map((b) => ({ id: `факт: ${b.kind}`, detail: `${b.statement} — ${b.why}` })),
  ]

  if (!issues.length) {
    await seo.from('articles').update({ status: 'ready_for_review' }).eq('id', articleId)
    return {
      outcome: 'done',
      result: { article_id: articleId, snapshot_id: snapshot?.id, nothing_to_fix: true,
        note: 'статья соответствует стандарту и подтверждена — правка не нужна', cost: 0 },
    }
  }

  const { reviseDraft } = await import('./generate')
  const { normalizeBody } = await import('./blog-style')
  const brief: any = { title, h1: title, slug, primary_keyword: job.payload?.query ?? slug, secondary_keywords: [] }

  // Тот же контекст, что и при написании новой статьи: факты, соседние
  // страницы, запросы. Без него правка пишется вслепую и легко противоречит
  // тому, что уже есть на сайте.
  const ctx = await buildContext(seo, {
    id: job.topic_id ?? null, title, primary_keyword: job.payload?.query ?? slug, cluster: null,
  })
  const revised = normalizeBody(await reviseDraft(ctx, brief, current, issues, []))

  // Обложка и описание берутся у вышедшей статьи: при обновлении рисовать
  // заново незачем, а без обложки публикация откажется работать
  const cover = await readThemeCover(slug).catch(() => null)
  const { data: registry } = await seo.from('pages')
    .select('meta_desc').eq('normalized_url', `https://goandstudy.com/blog/${slug}`).maybeSingle()

  const { data: version, error: verErr } = await seo.from('article_versions').insert({
    article_id: articleId, version_no: versionNo, origin: 'qa_fixed', title, body: revised,
    meta: {
      slug,
      // По этой пометке экран понимает: это правка живой статьи, а не выпуск
      // новой. Обложку и входящие ссылки требовать заново не надо.
      update_of: slug,
      updated_from: snapshot?.id,
      description: registry?.meta_desc ?? '',
      brief: { category: '', h1: title },
      ...(cover ? { cover: { format: 'jpeg', width: 480, height: 320, base64: cover, from_site: true } } : {}),
      reason: 'предложение правок',
    },
  }).select('id').single()
  if (verErr) return { outcome: 'failed', result: { error: `версия с правками: ${verErr.message}`, snapshot_id: snapshot?.id } }

  await seo.from('articles').update({ current_version_id: version?.id, status: 'ready_for_review' }).eq('id', articleId)

  await seo.from('change_sets').insert({
    article_id: articleId, kind: 'update_existing',
    from_version: snapshot?.id, to_version: version?.id,
    diff: {
      was_chars: current.length, now_chars: revised.length,
      issues_fixed: issues.map((i) => i.id).slice(0, 12),
    },
    reason: `обновление ${slug}: ${issues.length} замечаний — ${issues.slice(0, 3).map((i) => i.id).join(', ')}`,
    idempotency_key: `update:${slug}:${snapshot?.id}`,
    status: 'proposed', proposed_by: 'system',
  })

  return {
    outcome: 'done',
    result: {
      article_id: articleId, snapshot_id: snapshot?.id, version_id: version?.id,
      issues: issues.length, was_chars: current.length, now_chars: revised.length, cost: 0,
    },
  }
})


/**
 * Сторож: рассказать человеку о поломках. Работает часто и дёшево, потому что
 * молчащий конвейер ночью — это потерянные сутки при ритме «статья в день».
 */
registerStep('alerts_check', async (_job: Job, seo: any): Promise<StepOutcome> => {
  const { notifyAlerts } = await import('./alerts')
  const res = await notifyAlerts(seo)
  return { outcome: 'done', result: { ...res, cost: 0 } }
})


/**
 * Снимок движения позиций. Считается раз в сутки: данные Search Console
 * обновляются не чаще, а расчёт стоит двадцать секунд — столько экран ждать
 * не должен.
 */
registerStep('positions_snapshot', async (_job: Job, seo: any): Promise<StepOutcome> => {
  const { buildSnapshot } = await import('./positions')

  // Наши статьи — те, что написал конвейер: по ним движение интереснее всего
  const { data: arts } = await seo.from('articles').select('current_version_id').eq('status', 'published')
  const ourUrls = new Set<string>()
  for (const a of arts ?? []) {
    const { data: v } = await seo.from('article_versions').select('meta').eq('id', a.current_version_id).maybeSingle()
    const slug = (v?.meta as any)?.publish?.slug ?? (v?.meta as any)?.slug
    if (slug) ourUrls.add(`https://goandstudy.com/blog/${slug}`)
  }

  const snapshot = await buildSnapshot(seo, ourUrls)
  await seo.from('settings').upsert({ key: 'positions_snapshot', value: snapshot }, { onConflict: 'key' })

  return { outcome: 'done', result: { ...snapshot.summary, window: `${snapshot.windowFrom}…${snapshot.windowTo}`, cost: 0 } }
})


/* ── Самостоятельный выпуск ───────────────────────────────────────────────── */

/**
 * Машина сама доводит статью до сайта.
 *
 * Здесь важнее не то, что делается, а то, чего не делается ни при каких
 * настройках. Публикация статьи необратима: удаления у агента нет, и снять
 * плохой текст с сайта можно только руками. Поэтому ворота ниже — не
 * перестраховка, а единственное, что стоит между машиной и живым сайтом.
 *
 * Не выпускаем никогда:
 *   — при неподтверждённом существенном факте: цена, дедлайн, требования;
 *   — при непройденной блокирующей проверке стандарта;
 *   — если тема отбирает запросы у своей же страницы;
 *   — если обложки нет: карточка в блоге будет битой.
 */
registerStep('article_autopublish', async (_job: Job, seo: any): Promise<StepOutcome> => {
  const { loadFlow, nextPublishAt, scheduleNextPublish } = await import('./flow')
  const flow = await loadFlow(seo)
  if (!flow.enabled || !flow.autoPublish) {
    return { outcome: 'done', result: { skipped: 'самостоятельный выпуск выключен', cost: 0 } }
  }

  // Время выпуска — случайное внутри дневного окна и своё на каждый день:
  // одинаковый час изо дня в день выдаёт машину
  const due = await nextPublishAt(seo, flow)
  if (Date.now() < due.getTime()) {
    const hours = Math.round((due.getTime() - Date.now()) / 36e5)
    return { outcome: 'done', result: { skipped: `следующий выпуск ${due.toISOString().slice(11, 16)} UTC, через ${hours} ч`, cost: 0 } }
  }

  // Суточный предел считаем по факту публикаций, а не по расписанию: так
  // перезапуск воркера не может выпустить вторую статью сверх нормы
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count: today } = await seo.from('articles')
    .select('*', { count: 'exact', head: true }).eq('status', 'published').gte('published_at', dayAgo)
  if ((today ?? 0) >= flow.publishPerDay) {
    return { outcome: 'done', result: { skipped: `за сутки уже выпущено ${today}`, cost: 0 } }
  }

  const { data: candidates } = await seo.from('articles')
    .select('id, primary_keyword, current_version_id, topic_id')
    .in('status', ['ready_for_review', 'approved']).order('id')
  if (!candidates?.length) return { outcome: 'done', result: { skipped: 'готовых статей нет', cost: 0 } }

  const { checkBlogStandard, loadSiteTargets } = await import('./blog-style')
  const { factGate } = await import('./fact-gate')
  const { subjectKeysFor } = await import('./claims')
  const { enqueueJob } = await import('./enqueue')
  const targets = await loadSiteTargets(seo).catch(() => ({ knownBlogSlugs: new Set<string>(), knownPagePaths: new Set<string>() }))

  const rejected: string[] = []

  for (const a of candidates) {
    const { data: v } = await seo.from('article_versions')
      .select('id, title, body, meta, qa_report').eq('id', a.current_version_id).maybeSingle()
    if (!v) continue
    const meta: any = v.meta ?? {}
    const report: any = v.qa_report ?? {}

    // 1. Обложка. Без неё карточка в блоге выйдет битой
    if (!meta.cover?.base64 && !meta.images?.cover?.url) { rejected.push(`#${a.id}: нет обложки`); continue }

    // 2. Проверки стандарта — считаем заново по текущему телу, а не по отчёту:
    // отчёт мог устареть после починки
    const checks = checkBlogStandard({
      body: String(v.body ?? ''), title: String(v.title ?? ''),
      excerpt: String(meta.description ?? ''), slug: meta.slug ?? '',
      category: meta.brief?.category ?? '',
      knownBlogSlugs: targets.knownBlogSlugs, knownPagePaths: targets.knownPagePaths,
    })
    const blockers = checks.filter((c) => c.level === 'B' && !c.ok)
    if (blockers.length) {
      // Чинить или ждать человека — решает настройка, но выпускать нельзя
      if (flow.autoFix) {
        const { data: fixing } = await seo.from('jobs').select('id')
          .eq('step', 'article_fix').eq('article_id', a.id).in('status', ['pending', 'running', 'waiting']).limit(1)
        if (!fixing?.length) await enqueueJob(seo, { step: 'article_fix', lane: 'production', priority: 40, article_id: a.id, topic_id: a.topic_id, payload: {} })
      }
      rejected.push(`#${a.id}: ${blockers.length} блокирующих проверок`)
      continue
    }

    // 3. Существенные утверждения. Это то, из-за чего вообще стоит держать
    // человека в цепочке: ошибка в цене или дедлайне стоит читателю денег
    const gate = await factGate(seo, `${v.title} ${v.body}`, subjectKeysFor(a.primary_keyword ?? ''))
    if (gate.blocking.length) { rejected.push(`#${a.id}: ${gate.blocking.length} неподтверждённых существенных утверждений`); continue }

    // 4. Модель могла пометить выдуманные факты и обещания — их тоже не пускаем
    const invented = (report.issues ?? []).filter((i: any) => (i.kind === 'facts' || i.kind === 'promise') && i.severity !== 'minor')
    if (invented.length) {
      if (flow.autoFix) {
        const { data: fixing } = await seo.from('jobs').select('id')
          .eq('step', 'article_fix').eq('article_id', a.id).in('status', ['pending', 'running', 'waiting']).limit(1)
        if (!fixing?.length) await enqueueJob(seo, { step: 'article_fix', lane: 'production', priority: 40, article_id: a.id, topic_id: a.topic_id, payload: {} })
      }
      rejected.push(`#${a.id}: ${invented.length} непроверенных фактов`)
      continue
    }

    // Ворота пройдены — выпускаем
    await seo.from('articles').update({ status: 'approved' }).eq('id', a.id)
    const res = await enqueueJob(seo, {
      step: 'article_publish_blog', lane: 'production', priority: 60, runner: 'agent',
      article_id: a.id, topic_id: a.topic_id,
      payload: { dry_run: false, update: Boolean(meta.update_of), auto: true },
    })
    if (res.error) return { outcome: 'retry', result: { error: res.error } }

    // Следующее время назначаем сразу после постановки в очередь: если не
    // назначить, шаг будет пытаться выпускать ещё одну каждый час
    const next = await scheduleNextPublish(seo, flow)

    return {
      outcome: 'done',
      result: {
        published: a.id, keyword: a.primary_keyword, checked: gate.checked,
        next_at: next.toISOString(), rejected, cost: 0,
      },
    }
  }

  return { outcome: 'done', result: { published: null, why: 'ни одна статья не прошла ворота', rejected, cost: 0 } }
})


/* ── Яндекс ───────────────────────────────────────────────────────────────── */

/**
 * Состояние в Яндексе: что в поиске и по каким запросам показываемся.
 *
 * Отдельно от Google не по прихоти: половина поискового рынка в СНГ — Яндекс,
 * и до сих пор мы её не видели вовсе. Вчерашняя статья уже была в его поиске,
 * когда Google о ней ещё не знал.
 */
registerStep('yandex_sync', async (_job: Job, seo: any): Promise<StepOutcome> => {
  const { yandexConfigured, hostId, inSearchSamples, inSearchCount, popularQueries, recrawlQuota } = await import('./yandex')
  if (!yandexConfigured()) return { outcome: 'done', result: { skipped: 'нет доступа к Вебмастеру', cost: 0 } }

  const host = await hostId()
  const samples = await inSearchSamples(host)
  const total = await inSearchCount(host)

  // Наши статьи: по ним вопрос «дошло ли» стоит острее всего
  const { data: arts } = await seo.from('articles')
    .select('id, primary_keyword, current_version_id, published_at').eq('status', 'published')
  const ours: { id: number; keyword: string; url: string }[] = []
  for (const a of arts ?? []) {
    const { data: v } = await seo.from('article_versions').select('meta').eq('id', a.current_version_id).maybeSingle()
    const slug = (v?.meta as any)?.publish?.slug ?? (v?.meta as any)?.slug
    if (slug) ours.push({ id: a.id, keyword: a.primary_keyword, url: `https://goandstudy.com/blog/${slug}/` })
  }

  const norm = (u: string) => u.replace(/\/$/, '')
  const states = ours.map((o) => {
    const found = samples.get(norm(o.url))
    return {
      url: o.url,
      inSearch: found ? true : null,
      lastAccess: found?.lastAccess ?? null,
      note: found ? 'в поиске Яндекса' : 'среди присланных Яндексом страниц не найдена',
    }
  })

  // Весь сайт: сверяем инвентарь с тем, что Яндекс держит в поиске
  const { data: pages } = await seo.from('pages')
    .select('normalized_url, page_type').is('removed_at', null).eq('indexable', true).eq('http_status', 200)
  const site = (pages ?? [])
    .filter((p: any) => String(p.normalized_url).startsWith('https://goandstudy.com'))
    .map((p: any) => {
      const found = samples.get(norm(p.normalized_url))
      return { url: p.normalized_url, inSearch: !!found, lastAccess: found?.lastAccess ?? null }
    })

  const queries = await popularQueries(host, 500).catch(() => [])
  const quota = await recrawlQuota(host).catch(() => null)

  // Яндекс отдаёт только текущую неделю, истории у него не спросишь. Поэтому
  // копим сами: прежний снимок становится точкой отсчёта, когда ему исполнится
  // почти неделя. Сравнивать вчерашнее с сегодняшним бессмысленно — в недельном
  // окне это одни и те же дни.
  const { data: prevRow } = await seo.from('settings').select('value').eq('key', 'yandex_snapshot').maybeSingle()
  const prev: any = prevRow?.value ?? null
  if (prev?.computedAt && Date.now() - Date.parse(prev.computedAt) > 6 * 864e5) {
    await seo.from('settings').upsert({ key: 'yandex_snapshot_prev', value: prev }, { onConflict: 'key' })
  }

  await seo.from('settings').upsert({
    key: 'yandex_snapshot',
    value: {
      computedAt: new Date().toISOString(),
      articles: ours.map((o, i) => ({ ...o, ...states[i] })),
      // Число из истории — точное. Выборка адресов может быть меньше: Яндекс
      // не обязуется прислать всё, и путать одно с другим нельзя.
      inSearchTotal: total.count,
      inSearchAsOf: total.date,
      sampled: samples.size,
      quota,
      site,
      queries: queries.slice(0, 200),
      totals: {
        impressions: queries.reduce((s, q) => s + q.impressions, 0),
        clicks: queries.reduce((s, q) => s + q.clicks, 0),
      },
    },
  }, { onConflict: 'key' })

  return {
    outcome: 'done',
    result: {
      articles: states.length,
      inSearch: states.filter((s) => s.inSearch).length,
      site_in_search: site.filter((p: { inSearch: boolean }) => p.inSearch).length,
      site_total: site.length,
      yandex_says: total.count,
      queries: queries.length,
      cost: 0,
    },
  }
})
