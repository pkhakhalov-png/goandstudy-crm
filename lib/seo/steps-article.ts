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
import { renderCover, coverFilename } from './cover'
import { proposeDiagrams, renderDiagram, insertFigures } from './diagrams'
import { planIncomingLinks, saveLinkPlan } from './linkplan'
import { embed } from './embeddings'
import { wp, wpConfigured } from './wp'

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

  return {
    topicTitle: topic.title,
    primaryKeyword: topic.primary_keyword || topic.title,
    cluster: topic.cluster ?? null,
    related, queries,
  }
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
  const html = await generateDraft(ctx, brief)

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
    ...(await siteStrings(seo)),
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
    await next(seo, 'article_illustrate', articleId, job.topic_id!, { brief, ctx })
    return { outcome: 'done', result: { verdict: 'ready_for_review', checks_failed: 0, issues: report.issues.length, cost: 0 } }
  }

  if (attempt >= MAX_REVISIONS) {
    // §12.2: две попытки — и дальше решает человек, а не машина по кругу
    await seo.from('articles').update({ status: 'ready_for_review' }).eq('id', articleId)
    await next(seo, 'article_illustrate', articleId, job.topic_id!, { brief, ctx })
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

/* ── Шаг 4: обложка и схемы ───────────────────────────────────────────────── */

registerStep('article_illustrate', async (job: Job, seo: any): Promise<StepOutcome> => {
  const { brief } = job.payload as { brief: Brief }
  const articleId = job.article_id!
  if (!wpConfigured()) return { outcome: 'failed', result: { error: 'нет WP_BASE_URL / WP_BRIDGE_SECRET' } }

  const { data: article } = await seo.from('articles').select('current_version_id').eq('id', articleId).single()
  const { data: version } = await seo.from('article_versions').select('id,version_no,title,body,meta,qa_report').eq('id', article.current_version_id).single()
  const meta: any = version.meta ?? {}
  const slug: string = meta.slug ?? `article-${articleId}`
  const html = String(version.body)

  const cover = await renderCover({ title: brief.h1, kicker: brief.secondary_keywords?.[0] ?? null })
  const coverUp = await wp.media({ filename: coverFilename(slug), data: cover.buffer.toString('base64'), alt: cover.alt })

  const plans = await proposeDiagrams(html, String(version.title))
  const figures = []
  for (const [i, p] of plans.entries()) {
    const d = await renderDiagram(p.spec)
    const up = await wp.media({ filename: `${slug}-${i + 1}-${p.spec.type}.webp`, data: d.buffer.toString('base64'), alt: d.alt })
    figures.push({ plan: p, url: up.url, width: d.width, height: d.height, alt: d.alt, mediaId: up.media_id })
  }
  const illustrated = insertFigures(html, figures)

  const { data: nv, error } = await seo.from('article_versions').insert({
    article_id: articleId, version_no: (version.version_no ?? 1) + 1, origin: 'qa_fixed',
    title: version.title, body: illustrated,
    meta: {
      ...meta,
      images: {
        cover: { url: coverUp.url, media_id: coverUp.media_id, alt: cover.alt },
        figures: figures.map((f) => ({ url: f.url, media_id: f.mediaId, alt: f.alt, type: f.plan.spec.type })),
      },
    },
    prompt_version: PROMPT_VERSION, model: GEN_MODEL, qa_report: version.qa_report, qa_version: 'v1',
  }).select('id').single()
  if (error) return { outcome: 'failed', result: { error: `article_versions: ${error.message}` } }
  await seo.from('articles').update({ current_version_id: nv.id }).eq('id', articleId)

  await next(seo, 'article_linkplan', articleId, job.topic_id!, { brief })
  return { outcome: 'done', result: { cover: coverUp.url, figures: figures.length, cost: 0 } }
})

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
    fetchText: async (url) => {
      const res = await fetch(url, { headers: { 'User-Agent': 'goandstudy-seo-linkplan' }, signal: AbortSignal.timeout(20000) }).catch(() => null)
      if (!res || !res.ok) return null
      const html = await res.text()
      return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
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
