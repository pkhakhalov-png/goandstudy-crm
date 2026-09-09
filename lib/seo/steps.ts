// Реестр шагов SEO-пайплайна. Каждый шаг: (job, seo) => { outcome, result }.
// outcome: done | retry | failed | awaiting_human. seo = supabase-клиент schema('seo').
import { safeFetch } from './safe-fetch'
import { normalizeUrl } from './normalize'
import { crawlPage } from './crawl'
import { computeInventoryFindings, computeTechnicalFindings, computeGscFindings } from './findings'
import { computeClusters } from './cluster'
import { reclusterTopics } from './topics'
import { embed, toPgVector } from './embeddings'
import { gscConfigured, getAccessToken, searchAnalytics, daysAgo } from './gsc'

export type Job = {
  id: number
  step: string
  lane: string
  payload: Record<string, any>
  run_id: number | null
  run_item_id: number | null
  article_id: number | null
  topic_id: number | null
}

export type StepOutcome = {
  outcome: 'done' | 'retry' | 'failed' | 'awaiting_human'
  result?: Record<string, any>
}

type Handler = (job: Job, seo: any) => Promise<StepOutcome>

function extractLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1])
}

const registry: Record<string, Handler> = {
  // ── Технические (M0) ──────────────────────────────────────────────────────
  echo: async (job) => ({ outcome: 'done', result: { echoed: job.payload ?? {}, cost: 0 } }),
  noop: async () => ({ outcome: 'done', result: { cost: 0 } }),

  // ── M1: инвентарь по sitemap → fan-out на crawl_page ──────────────────────
  inventory_sitemap: async (job, seo) => {
    const sitemapUrl: string = job.payload.sitemap_url
    if (!sitemapUrl) return { outcome: 'failed', result: { error: 'no sitemap_url in payload' } }
    const res = await safeFetch(sitemapUrl)
    if (!res.ok) return { outcome: 'retry', result: { error: `sitemap: ${res.reason}` } }
    const xml = res.body.toString('utf8')

    let pageUrls: string[] = extractLocs(xml)
    if (/<sitemapindex/i.test(xml)) {
      // индекс сайтмапов — тянем вложенные
      const collected: string[] = []
      for (const sm of pageUrls) {
        const r = await safeFetch(sm)
        if (r.ok) collected.push(...extractLocs(r.body.toString('utf8')))
      }
      pageUrls = collected
    }

    const norm = [...new Set(pageUrls.map((u) => normalizeUrl(u, false)))].filter(Boolean)
    if (!norm.length) return { outcome: 'done', result: { urls: 0, note: 'sitemap пуст' } }

    // universe
    await seo.from('url_universe').upsert(
      norm.map((u) => ({ normalized_url: u, origins: ['sitemap'] })),
      { onConflict: 'normalized_url', ignoreDuplicates: true },
    )
    // fan-out: по одной crawl-задаче на URL (lane=crawl)
    const jobs = norm.map((u) => ({ step: 'crawl_page', lane: 'crawl', priority: 100, payload: { url: u } }))
    for (let i = 0; i < jobs.length; i += 100) {
      const { error } = await seo.from('jobs').insert(jobs.slice(i, i + 100))
      if (error) return { outcome: 'retry', result: { error: `enqueue: ${error.message}` } }
    }
    return { outcome: 'done', result: { urls: norm.length, cost: 0 } }
  },

  // ── Эмбеддинги: заполнить pages.embedding (title+h1+meta) через Voyage ────
  embed_pages: async (_job, seo) => {
    const { data: pages } = await seo.from('pages').select('id, title, h1, meta_desc')
      .is('embedding', null).is('removed_at', null).limit(300)
    if (!pages?.length) return { outcome: 'done', result: { embedded: 0, cost: 0 } }
    const model = process.env.EMBEDDING_MODEL || 'voyage-3'
    let done = 0
    for (let i = 0; i < pages.length; i += 50) {
      const batch = pages.slice(i, i + 50)
      const texts = batch.map((p: any) =>
        [p.title, p.h1, p.meta_desc].filter(Boolean).join(' — ').slice(0, 2000) || p.title || '(no text)')
      const vecs = await embed(texts)
      for (let j = 0; j < batch.length; j++) {
        await seo.from('pages').update({ embedding: toPgVector(vecs[j]), embedding_model: model }).eq('id', batch[j].id)
        done++
      }
    }
    // если ещё остались — поставить продолжение
    const more = pages.length === 300
    if (more) await seo.from('jobs').insert({ step: 'embed_pages', lane: 'production', priority: 60, payload: {} })
    return { outcome: 'done', result: { embedded: done, more, cost: 0 } }
  },

  // ── M2: импорт GSC (клики/показы/позиции) ─────────────────────────────────
  gsc_import: async (job, seo) => {
    if (!gscConfigured()) {
      return { outcome: 'awaiting_human', result: { need: 'GSC_CLIENT_ID/SECRET/REFRESH_TOKEN/SITE_URL в env' } }
    }
    const endDate = job.payload.endDate || daysAgo(3)   // задержка GSC 2-3 дня
    const startDate = job.payload.startDate || daysAgo(120)
    const token = await getAccessToken()

    const upsertPage = async (rows: any[]) => {
      for (let i = 0; i < rows.length; i += 500) {
        await seo.from('gsc_page_daily').upsert(rows.slice(i, i + 500), { onConflict: 'normalized_url,date' })
      }
    }
    const upsertDaily = async (rows: any[]) => {
      for (let i = 0; i < rows.length; i += 500) {
        await seo.from('gsc_daily').upsert(rows.slice(i, i + 500), { onConflict: 'normalized_url,query,date' })
      }
    }

    // 1) честные итоги по странице: dimensions date+page
    let pageRows = 0
    for (let start = 0; start < 250_000; start += 25_000) {
      const rows = await searchAnalytics(token, { startDate, endDate, dimensions: ['date', 'page'], startRow: start })
      if (!rows.length) break
      await upsertPage(rows.map((r) => ({
        normalized_url: normalizeUrl(r.keys[1], false), date: r.keys[0],
        clicks: r.clicks, impressions: r.impressions, position: r.position, ctr: r.ctr,
      })))
      pageRows += rows.length
      if (rows.length < 25_000) break
    }

    // 2) запросный срез: dimensions date+page+query (неполный, см. 4.3)
    let queryRows = 0
    for (let start = 0; start < 500_000; start += 25_000) {
      const rows = await searchAnalytics(token, { startDate, endDate, dimensions: ['date', 'page', 'query'], startRow: start })
      if (!rows.length) break
      await upsertDaily(rows.map((r) => ({
        normalized_url: normalizeUrl(r.keys[1], false), query: r.keys[2], date: r.keys[0],
        clicks: r.clicks, impressions: r.impressions, position: r.position, ctr: r.ctr,
      })))
      queryRows += rows.length
      if (rows.length < 25_000) break
    }

    return { outcome: 'done', result: { startDate, endDate, pageRows, queryRows, cost: 0 } }
  },

  // ── M5-частично: находки из инвентаря (без GSC) ───────────────────────────
  findings_inventory: async (_job, seo) => {
    const counts = await computeInventoryFindings(seo)
    return { outcome: 'done', result: { findings: counts, cost: 0 } }
  },

  // ── M5/M2: находки из Google Search Console (striking-distance/CTR/каннибализация) ──
  findings_gsc: async (_job, seo) => {
    if (!gscConfigured()) return { outcome: 'awaiting_human', result: { need: 'GSC_* в env + запуск gsc_import' } }
    const counts = await computeGscFindings(seo)
    return { outcome: 'done', result: { findings: counts, cost: 0 } }
  },

  // ── Тематическая кластеризация страниц по эмбеддингам (spherical k-means) ──
  cluster_pages: async (job, seo) => {
    const k = Number(job.payload.k) || 0   // 0 → авто-подбор
    const res = await computeClusters(seo, { k })
    const topics = await reclusterTopics(seo)   // темы статей относим к новым кластерам
    return { outcome: 'done', result: { ...res, topics_reclustered: topics.updated, cost: 0 } }
  },

  // ── Технический аудит (порт чеклистов claude-seo): title/meta/h1/thin/schema/llms/robots ──
  technical_findings: async (job, seo) => {
    const origin = job.payload.origin || 'https://goandstudy.com'
    const counts = await computeTechnicalFindings(seo, safeFetch, origin)
    return { outcome: 'done', result: { findings: counts, cost: 0 } }
  },

  // ── Проверка «ссылок в никуда»: 404 → broken_link, 200 → пробел sitemap ───
  check_missing_links: async (_job, seo) => {
    const pageUrls = new Set<string>()
    for (let from = 0; ; from += 1000) {
      const { data } = await seo.from('pages').select('normalized_url').range(from, from + 999)
      for (const p of data ?? []) pageUrls.add(p.normalized_url)
      if (!data || data.length < 1000) break
    }
    const targets = new Set<string>()
    for (let from = 0; ; from += 1000) {
      const { data } = await seo.from('link_edges').select('to_url').eq('link_type', 'internal').is('to_page_id', null).range(from, from + 999)
      for (const e of data ?? []) if (!pageUrls.has(e.to_url)) targets.add(e.to_url)
      if (!data || data.length < 1000) break
    }
    const list = [...targets].slice(0, 120)
    const broken: { url: string; status: number }[] = []
    let checked = 0
    for (const url of list) {
      if (!/^https?:\/\//.test(url)) continue
      const r = await safeFetch(url)
      checked++
      if (!r.ok && (r.status === 404 || r.status === 410)) broken.push({ url, status: r.status })
    }
    // перезаписать broken_link находки
    await seo.from('findings').delete().eq('kind', 'broken_link').eq('status', 'open').is('change_set_id', null)
    if (broken.length) {
      const now = new Date().toISOString()
      await seo.from('findings').insert(broken.map((b) => ({
        kind: 'broken_link', confidence: 'high', page_ids: [],
        evidence: { url: b.url, status: b.status }, status: 'open', detected_at: now, last_seen_at: now,
      })))
    }
    return { outcome: 'done', result: { checked, broken: broken.length, cost: 0 } }
  },

  // ── M1: обойти одну страницу ──────────────────────────────────────────────
  crawl_page: async (job, seo) => {
    const url: string = job.payload.url
    if (!url) return { outcome: 'failed', result: { error: 'no url in payload' } }
    const r = await crawlPage(seo, url, normalizeUrl)
    // транзиентные ошибки — ретрай; недоступность страницы (записана) — done
    if (!r.ok && r.reason && /fetch failed|http 5\d\d|too large|redirect/i.test(r.reason)) {
      return { outcome: 'retry', result: { error: r.reason } }
    }
    return { outcome: 'done', result: { pageId: r.pageId, crawled: r.ok, reason: r.reason ?? null, cost: 0 } }
  },
}

export function registerStep(step: string, handler: Handler) {
  registry[step] = handler
}

export async function runStep(job: Job, seo: any): Promise<StepOutcome> {
  const handler = registry[job.step]
  if (!handler) return { outcome: 'failed', result: { error: `no handler for step "${job.step}"` } }
  return handler(job, seo)
}
