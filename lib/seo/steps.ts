// Реестр шагов SEO-пайплайна. Каждый шаг: (job, seo) => { outcome, result }.
// outcome: done | retry | failed | awaiting_human. seo = supabase-клиент schema('seo').
import { safeFetch } from './safe-fetch'
import { normalizeUrl } from './normalize'
import { crawlPage } from './crawl'
import { computeInventoryFindings } from './findings'

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

  // ── M5-частично: находки из инвентаря (без GSC) ───────────────────────────
  findings_inventory: async (_job, seo) => {
    const counts = await computeInventoryFindings(seo)
    return { outcome: 'done', result: { findings: counts, cost: 0 } }
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
