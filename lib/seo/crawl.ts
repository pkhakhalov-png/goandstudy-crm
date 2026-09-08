// M1 Инвентарь: обход страницы, парсинг метаданных и ссылок, идемпотентный апсерт
// в seo.pages / seo.link_edges / seo.url_universe. Без WP REST — только публичный HTML.
import { parse, type HTMLElement } from 'node-html-parser'
import { createHash } from 'node:crypto'
import { safeFetch } from './safe-fetch'

const REGISTRABLE = 'goandstudy.com'   // всё считаем «нашим», если хост оканчивается на это

export function classifyUrl(u: URL): { platform: string; page_type: string } {
  const host = u.hostname.replace(/^www\./, '')
  const path = u.pathname
  if (host.startsWith('crm.') || path.startsWith('/book')) {
    return { platform: 'next', page_type: 'landing' }
  }
  // всё остальное на goandstudy.com — WordPress
  if (path.startsWith('/blog/')) return { platform: 'wordpress', page_type: 'article' }
  if (path === '/' || path === '') return { platform: 'wordpress', page_type: 'other' }
  return { platform: 'wordpress', page_type: 'service' }
}

function textOf(el: HTMLElement | null): string {
  return (el?.text ?? '').replace(/\s+/g, ' ').trim()
}

function blockOfLink(a: HTMLElement): string {
  let n: HTMLElement | null = a.parentNode as HTMLElement | null
  while (n) {
    const t = (n.rawTagName || '').toLowerCase()
    if (t === 'nav') return 'nav'
    if (t === 'header') return 'nav'
    if (t === 'footer') return 'footer'
    if (t === 'aside') return 'sidebar'
    n = n.parentNode as HTMLElement | null
  }
  return 'content'
}

export type ParsedPage = {
  finalUrl: string
  httpStatus: number
  title: string | null
  h1: string | null
  metaDesc: string | null
  canonical: string | null
  noindex: boolean
  hasSchema: boolean
  wordCount: number
  contentHash: string
  links: { href: string; anchor: string; block: string; position: number; rel: string | null }[]
}

export function parseHtml(html: string, finalUrl: string, httpStatus: number): ParsedPage {
  const root = parse(html, { blockTextElements: { script: false, style: false } })

  const title = textOf(root.querySelector('title')) || null
  const h1 = textOf(root.querySelector('h1')) || null

  const metaDesc = root.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || null
  const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute('href')?.trim() || null
  const robots = (root.querySelector('meta[name="robots"]')?.getAttribute('content') || '').toLowerCase()
  const noindex = robots.includes('noindex')
  const hasSchema = !!root.querySelector('script[type="application/ld+json"]')

  // word count: тело без script/style
  root.querySelectorAll('script, style, noscript').forEach((n) => n.remove())
  const bodyText = textOf(root.querySelector('body') || root)
  const wordCount = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0
  const contentHash = createHash('sha256').update(bodyText).digest('hex')

  const links: ParsedPage['links'] = []
  let pos = 0
  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href')?.trim()
    if (!href) continue
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue
    let abs: string
    try { abs = new URL(href, finalUrl).toString() } catch { continue }
    links.push({
      href: abs,
      anchor: textOf(a).slice(0, 300),
      block: blockOfLink(a),
      position: pos++,
      rel: a.getAttribute('rel') || null,
    })
  }

  return { finalUrl, httpStatus, title, h1, metaDesc, canonical, noindex, hasSchema, wordCount, contentHash, links }
}

function isSameSite(u: string): boolean {
  try { return new URL(u).hostname.replace(/^www\./, '').endsWith(REGISTRABLE) } catch { return false }
}

/**
 * Обойти один URL и записать в инвентарь. `norm` — функция нормализации (общая с БД).
 * Возвращает { pageId, discovered } — id страницы и найденные внутренние URL (для universe).
 */
export async function crawlPage(
  seo: any,
  normalizedUrl: string,
  norm: (u: string, stripQuery?: boolean) => string,
): Promise<{ ok: boolean; pageId?: number; reason?: string }> {
  const res = await safeFetch(normalizedUrl)
  const now = new Date().toISOString()

  if (!res.ok) {
    // недоступна — фиксируем статус, не роняем инвентарь
    const { data } = await seo.from('pages').upsert(
      { normalized_url: normalizedUrl, url: normalizedUrl, platform: classifyUrl(new URL(normalizedUrl)).platform,
        page_type: classifyUrl(new URL(normalizedUrl)).page_type, http_status: res.status ?? 0,
        indexable: false, last_crawled_at: now },
      { onConflict: 'normalized_url' },
    ).select('id').single()
    return { ok: false, pageId: data?.id, reason: res.reason }
  }

  const html = res.body.toString('utf8')
  const p = parseHtml(html, res.finalUrl, res.status)
  const cls = classifyUrl(new URL(res.finalUrl))
  const canonicalNorm = p.canonical ? norm(p.canonical, cls.page_type === 'article') : null
  const indexable = res.status === 200 && !p.noindex && (!canonicalNorm || canonicalNorm === normalizedUrl)

  const { data: page, error } = await seo.from('pages').upsert(
    {
      normalized_url: normalizedUrl,
      url: res.finalUrl,
      platform: cls.platform,
      page_type: cls.page_type,
      editable: false,               // true появится только через WP Bridge (M4)
      http_status: res.status,
      indexable,
      canonical_url: canonicalNorm,
      title: p.title,
      h1: p.h1,
      meta_desc: p.metaDesc,
      word_count: p.wordCount,
      content_hash: p.contentHash,
      last_crawled_at: now,
      removed_at: null,
    },
    { onConflict: 'normalized_url' },
  ).select('id').single()
  if (error) return { ok: false, reason: error.message }

  // ссылки: пере-записываем набор для этой страницы (идемпотентно)
  await seo.from('link_edges').delete().eq('from_page_id', page.id)
  if (p.links.length) {
    // резолвим to_page_id по известным страницам
    const internalUrls = [...new Set(p.links.filter((l) => isSameSite(l.href)).map((l) => norm(l.href, false)))]
    const { data: known } = internalUrls.length
      ? await seo.from('pages').select('id, normalized_url').in('normalized_url', internalUrls)
      : { data: [] as any[] }
    const idByUrl = new Map((known ?? []).map((k: any) => [k.normalized_url, k.id]))

    const rows = p.links.map((l) => {
      const internal = isSameSite(l.href)
      const toNorm = internal ? norm(l.href, false) : l.href
      return {
        from_page_id: page.id,
        to_url: toNorm,
        to_page_id: internal ? (idByUrl.get(toNorm) ?? null) : null,
        anchor: l.anchor || null,
        link_type: internal ? 'internal' : 'external',
        block: l.block,
        position: l.position,
        rel: l.rel,
        last_seen_at: now,
      }
    })
    await seo.from('link_edges').insert(rows)

    // discovered внутренние URL → в universe (origin=crawl), без авто-обхода
    const discovered = internalUrls.map((u) => ({ normalized_url: u, origins: ['crawl'], page_id: idByUrl.get(u) ?? null }))
    if (discovered.length) {
      await seo.from('url_universe').upsert(discovered, { onConflict: 'normalized_url', ignoreDuplicates: true })
    }
  }

  return { ok: true, pageId: page.id }
}
