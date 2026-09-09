// M5-частично: находки, вычислимые из инвентаря (без GSC):
// orphan, duplicate_title, duplicate_content, missing_link_target.
// Полный набор (каннибализация, striking-distance, ctr) требует GSC — добавится в M5/M2.

type Page = {
  id: number
  normalized_url: string
  indexable: boolean
  page_type: string
  title: string | null
  content_hash: string | null
  cluster: string | null
}

async function fetchAll(seo: any, table: string, cols: string, apply?: (q: any) => any): Promise<any[]> {
  const out: any[] = []
  let from = 0
  const size = 1000
  for (;;) {
    let q = seo.from(table).select(cols).range(from, from + size - 1)
    if (apply) q = apply(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data || []))
    if (!data || data.length < size) break
    from += size
  }
  return out
}

const norm = (s: string | null) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ')

// ── Технический аудит: порт автоматизируемой части чеклистов claude-seo ──────
// (seo-technical: title/meta/h1/thin-content; seo-schema: наличие JSON-LD;
//  seo-geo/AI-visibility: llms.txt; crawlability: robots.txt + sitemap-декларация).
// Всё считается из уже собранного инвентаря (seo.pages) + один запрос robots/llms.
type TechPage = {
  id: number
  normalized_url: string
  indexable: boolean
  page_type: string
  title: string | null
  h1: string | null
  meta_desc: string | null
  word_count: number | null
  has_schema: boolean | null
  cluster: string | null
  http_status: number | null
  canonical_url: string | null
}

// Пороговые значения (из чеклистов; в символах/словах)
const TITLE_MIN = 20, TITLE_MAX = 65        // ~200-600px → символьное приближение
const META_MIN = 70, META_MAX = 160
const THIN_WORDS = 300                       // seo-content: тонкий контент

const TECH_KINDS = [
  'technical_critical',
  'missing_title', 'missing_h1', 'missing_meta_desc',
  'title_length', 'meta_desc_length', 'thin_content',
  'missing_schema', 'llms_txt_missing', 'robots_sitemap',
]

/** Технические находки из инвентаря + один site-wide запрос. Возвращает счётчики. */
export async function computeTechnicalFindings(seo: any, safeFetch: (u: string) => Promise<any>, origin: string): Promise<Record<string, number>> {
  // has_schema появляется миграцией 20260908000001; если её ещё нет — читаем без неё
  let pages: TechPage[]
  try {
    pages = await fetchAll(
      seo, 'pages',
      'id, normalized_url, indexable, page_type, title, h1, meta_desc, word_count, has_schema, cluster, http_status, canonical_url',
      (q) => q.is('removed_at', null),
    )
  } catch (e: any) {
    if (!/has_schema|column|PGRST/i.test(e?.message || '')) throw e
    const base = await fetchAll(
      seo, 'pages',
      'id, normalized_url, indexable, page_type, title, h1, meta_desc, word_count, cluster, http_status, canonical_url',
      (q) => q.is('removed_at', null),
    )
    pages = base.map((p: any) => ({ ...p, has_schema: null }))
  }

  // показы по URL из GSC (для приоритета schema и критических техпроблем «есть трафик, но…»)
  const imprByUrl = new Map<string, number>()
  try {
    for (let from = 0; ; from += 1000) {
      const { data } = await seo.from('gsc_page_daily').select('normalized_url, impressions').range(from, from + 999)
      for (const r of data ?? []) imprByUrl.set(r.normalized_url, (imprByUrl.get(r.normalized_url) || 0) + (r.impressions || 0))
      if (!data || data.length < 1000) break
    }
  } catch { /* GSC ещё не импортирован — приоритет без показов */ }
  const findings: { kind: string; confidence: string; page_ids: number[]; evidence: any }[] = []
  const clusterById = new Map(pages.map((p) => [p.id, p.cluster]))
  const add = (kind: string, confidence: string, id: number, url: string, extra: any = {}) =>
    findings.push({ kind, confidence, page_ids: [id], evidence: { url, cluster: clusterById.get(id) ?? null, ...extra } })

  const isContent = (t: string) => t === 'article' || t === 'service' || t === 'landing' || t === 'commercial'

  // ── Критические техпроблемы (§5.8: canonical/robots/noindex/HTTP — высший приоритет) ──
  for (const p of pages) {
    const impr = imprByUrl.get(p.normalized_url) || 0
    if (p.http_status && p.http_status >= 400) {
      add('technical_critical', 'high', p.id, p.normalized_url, { issue: 'http_error', status: p.http_status, impressions: impr, note: `страница отдаёт HTTP ${p.http_status}` })
    } else if (p.canonical_url && p.canonical_url !== p.normalized_url) {
      add('technical_critical', impr > 0 ? 'high' : 'medium', p.id, p.normalized_url, { issue: 'canonical_mismatch', canonical: p.canonical_url, impressions: impr, note: 'canonical указывает на другой URL — страница отдаёт вес другой' })
    } else if (!p.indexable && impr > 50) {
      add('technical_critical', 'high', p.id, p.normalized_url, { issue: 'noindex_with_traffic', impressions: impr, note: 'страница получает показы в поиске, но помечена неиндексируемой — проверить robots/noindex/canonical' })
    }
  }

  for (const p of pages) {
    if (!p.indexable) continue
    const title = (p.title || '').trim()
    const meta = (p.meta_desc || '').trim()

    if (!title) add('missing_title', 'high', p.id, p.normalized_url)
    else if (title.length < TITLE_MIN) add('title_length', 'medium', p.id, p.normalized_url, { title, len: title.length, issue: 'short', want: `${TITLE_MIN}-${TITLE_MAX}` })
    else if (title.length > TITLE_MAX) add('title_length', 'medium', p.id, p.normalized_url, { title, len: title.length, issue: 'long', want: `${TITLE_MIN}-${TITLE_MAX}` })

    if (!(p.h1 || '').trim()) add('missing_h1', 'high', p.id, p.normalized_url)

    if (!meta) add('missing_meta_desc', 'medium', p.id, p.normalized_url)
    else if (meta.length < META_MIN) add('meta_desc_length', 'low', p.id, p.normalized_url, { len: meta.length, issue: 'short', want: `${META_MIN}-${META_MAX}` })
    else if (meta.length > META_MAX) add('meta_desc_length', 'low', p.id, p.normalized_url, { len: meta.length, issue: 'long', want: `${META_MIN}-${META_MAX}` })

    if (isContent(p.page_type) && (p.word_count ?? 0) > 0 && (p.word_count as number) < THIN_WORDS)
      add('thin_content', 'medium', p.id, p.normalized_url, { words: p.word_count, want: `>= ${THIN_WORDS}` })

    // has_schema === false → точно нет JSON-LD; приоритет по показам (§5.6), не «82 работы»
    if (p.has_schema === false && isContent(p.page_type)) {
      const impr = imprByUrl.get(p.normalized_url) || 0
      const rec = p.page_type === 'article' ? 'Article/BlogPosting' : 'Service/EducationalOrganization'
      add('missing_schema', impr >= 500 ? 'medium' : 'low', p.id, p.normalized_url,
        { page_type: p.page_type, impressions: impr, priority: impr, note: `нет JSON-LD; тип ${rec} (приоритет по показам: ${impr})` })
    }
  }

  // ── Site-wide: robots.txt (sitemap-декларация) + llms.txt (AI/GEO-видимость) ──
  let origHost = ''
  try { origHost = new URL(origin).origin } catch { origHost = origin.replace(/\/+$/, '') }

  const robots = await safeFetch(`${origHost}/robots.txt`).catch(() => ({ ok: false }))
  const robotsText = robots.ok ? (robots.body?.toString('utf8') || '') : ''
  if (!robots.ok || !/sitemap:/i.test(robotsText)) {
    findings.push({ kind: 'robots_sitemap', confidence: 'medium', page_ids: [],
      evidence: { url: `${origHost}/robots.txt`, exists: !!robots.ok, has_sitemap_directive: /sitemap:/i.test(robotsText),
        note: 'robots.txt не объявляет Sitemap: — снижает эффективность обхода' } })
  }

  const llms = await safeFetch(`${origHost}/llms.txt`).catch(() => ({ ok: false }))
  if (!llms.ok || (llms.status && llms.status >= 400)) {
    findings.push({ kind: 'llms_txt_missing', confidence: 'low', page_ids: [],
      evidence: { url: `${origHost}/llms.txt`, exists: false,
        note: 'нет /llms.txt — файла-ориентира для AI-ассистентов (ChatGPT/Perplexity/Claude); повышает AI-видимость' } })
  }

  // перезаписать открытые незанятые технические находки
  await seo.from('findings').delete().in('kind', TECH_KINDS).eq('status', 'open').is('change_set_id', null)
  const now = new Date().toISOString()
  const rows = findings.map((f) => ({ ...f, status: 'open', detected_at: now, last_seen_at: now }))
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await seo.from('findings').insert(rows.slice(i, i + 200))
    if (error) throw new Error(`tech findings insert: ${error.message}`)
  }

  const counts: Record<string, number> = {}
  for (const f of findings) counts[f.kind] = (counts[f.kind] || 0) + 1
  return counts
}

/** Пересчитать инвентарные находки. Возвращает счётчики по видам. */
export async function computeInventoryFindings(seo: any): Promise<Record<string, number>> {
  const pages: Page[] = await fetchAll(seo, 'pages', 'id, normalized_url, indexable, page_type, title, content_hash, cluster', (q) => q.is('removed_at', null))
  const clusterOf = new Map(pages.map((p) => [p.id, p.cluster]))
  const urlCluster = new Map(pages.map((p) => [p.normalized_url, p.cluster]))
  const contentEdges = await fetchAll(seo, 'link_edges', 'to_url', (q) => q.eq('link_type', 'internal').eq('block', 'content'))
  const allInternal = await fetchAll(seo, 'link_edges', 'from_page_id, to_url, anchor', (q) => q.eq('link_type', 'internal').is('to_page_id', null))

  const urlToPage = new Map(pages.map((p) => [p.normalized_url, p]))
  const linkedContent = new Set(contentEdges.map((e) => e.to_url))

  const findings: { kind: string; confidence: string; page_ids: number[]; evidence: any }[] = []

  // 1) orphan — индексируемая страница без входящих content-ссылок
  for (const p of pages) {
    if (p.indexable && !linkedContent.has(p.normalized_url)) {
      findings.push({ kind: 'orphan', confidence: 'high', page_ids: [p.id], evidence: { url: p.normalized_url, page_type: p.page_type } })
    }
  }

  // 2) duplicate_title — одинаковый нормализованный title у ≥2 индексируемых
  const byTitle = new Map<string, Page[]>()
  for (const p of pages) {
    if (!p.indexable || !p.title) continue
    const k = norm(p.title)
    if (!k) continue
    ;(byTitle.get(k) ?? byTitle.set(k, []).get(k)!).push(p)
  }
  for (const [, group] of byTitle) {
    if (group.length >= 2) {
      findings.push({ kind: 'duplicate_title', confidence: 'high', page_ids: group.map((g) => g.id).slice(0, 20),
        evidence: { title: group[0].title, urls: group.map((g) => g.normalized_url) } })
    }
  }

  // 3) duplicate_content — одинаковый content_hash у ≥2 индексируемых
  const byHash = new Map<string, Page[]>()
  for (const p of pages) {
    if (!p.indexable || !p.content_hash) continue
    ;(byHash.get(p.content_hash) ?? byHash.set(p.content_hash, []).get(p.content_hash)!).push(p)
  }
  for (const [, group] of byHash) {
    if (group.length >= 2) {
      findings.push({ kind: 'duplicate_title', confidence: 'high', page_ids: group.map((g) => g.id).slice(0, 20),
        evidence: { duplicate_content: true, urls: group.map((g) => g.normalized_url) } })
    }
  }

  // 4) missing_link_target — внутренние ссылки на URL вне инвентаря (кандидаты «нет страницы»/пробел sitemap)
  const missing = new Map<string, { from: Set<number>; anchors: Set<string> }>()
  for (const e of allInternal) {
    if (urlToPage.has(e.to_url)) continue
    const m = missing.get(e.to_url) ?? { from: new Set<number>(), anchors: new Set<string>() }
    m.from.add(e.from_page_id)
    if (e.anchor) m.anchors.add(e.anchor)
    missing.set(e.to_url, m)
  }
  const majorityCluster = (ids: number[] | Set<number>): string | null => {
    const cnt = new Map<string, number>()
    for (const id of ids) { const c = clusterOf.get(id); if (c) cnt.set(c, (cnt.get(c) || 0) + 1) }
    let best: string | null = null, n = 0
    for (const [c, k] of cnt) if (k > n) { n = k; best = c }
    return best
  }
  for (const [url, m] of missing) {
    findings.push({ kind: 'content_gap', confidence: 'low', page_ids: [],
      evidence: { missing_url: url, linked_from_count: m.from.size, anchors: [...m.anchors].slice(0, 5), reason: 'internal link to non-inventoried URL', cluster: majorityCluster(m.from) } })
  }

  // 5) near-duplicate по эмбеддингам — сигнал каннибализации без GSC (confidence low)
  const emb = await fetchAll(seo, 'pages', 'id, page_type, embedding', (q) => q.not('embedding', 'is', null).is('removed_at', null))
  const vecs: { id: number; type: string; v: number[] }[] = []
  for (const p of emb) {
    let arr: number[] | null = null
    try { arr = typeof p.embedding === 'string' ? JSON.parse(p.embedding) : p.embedding } catch { arr = null }
    if (!arr || !arr.length) continue
    // нормируем для косинуса = dot
    let n = 0; for (const x of arr) n += x * x; n = Math.sqrt(n) || 1
    vecs.push({ id: p.id, type: p.page_type, v: arr.map((x) => x / n) })
  }
  const idxById = new Map(pages.map((p) => [p.id, p.indexable]))
  const THRESH = 0.80   // title+h1+meta эмбеддинги дискриминативны; настоящая каннибализация — по GSC
  for (let i = 0; i < vecs.length; i++) {
    for (let j = i + 1; j < vecs.length; j++) {
      if (vecs[i].type !== vecs[j].type) continue
      if (!idxById.get(vecs[i].id) || !idxById.get(vecs[j].id)) continue
      let dot = 0; const a = vecs[i].v, b = vecs[j].v
      for (let k = 0; k < a.length; k++) dot += a[k] * b[k]
      if (dot >= THRESH) {
        findings.push({ kind: 'cannibalization', confidence: 'low', page_ids: [vecs[i].id, vecs[j].id],
          evidence: { signal: 'embedding', cosine: Math.round(dot * 1000) / 1000, note: 'похожие страницы (эмбеддинг); подтвердится пересечением запросов после GSC' } })
      }
    }
  }

  // проставить кластер по участвующим страницам (для группировки конфликтов по теме)
  for (const f of findings) {
    if (f.evidence.cluster !== undefined) continue
    f.evidence.cluster = f.page_ids.length ? majorityCluster(f.page_ids) : null
  }

  // перезаписать открытые незанятые находки этих видов
  await seo.from('findings').delete().in('kind', ['orphan', 'duplicate_title', 'content_gap']).eq('status', 'open').is('change_set_id', null)
  // каннибализацию трогаем только «эмбеддинговую» — GSC-версию (signal=gsc) не сносим
  await seo.from('findings').delete().eq('kind', 'cannibalization').filter('evidence->>signal', 'eq', 'embedding').eq('status', 'open').is('change_set_id', null)
  const now = new Date().toISOString()
  const rows = findings.map((f) => ({ ...f, status: 'open', detected_at: now, last_seen_at: now }))
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await seo.from('findings').insert(rows.slice(i, i + 200))
    if (error) throw new Error(`findings insert: ${error.message}`)
  }

  const counts: Record<string, number> = {}
  for (const f of findings) counts[f.kind] = (counts[f.kind] || 0) + 1
  return counts
}

// ── GSC-находки: striking-distance, CTR-возможности, реальная каннибализация ──
// Считаются из seo.gsc_daily (запрос×страница×день) за импортированное окно.
// Требуют импорта GSC (gsc_import). Каждая находка несёт cluster участвующих страниц.

function posBucket(p: number): string {
  if (p < 1.5) return '1'; if (p < 2.5) return '2'; if (p < 3.5) return '3'
  if (p <= 5) return '4-5'; if (p <= 10) return '6-10'; if (p <= 20) return '11-20'; return '21+'
}
function median(xs: number[]): number { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
function percentile(xs: number[], p: number): number { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] }
function stdev(xs: number[]): number { if (xs.length < 2) return 0; const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length) }

const GSC_KINDS = ['striking_distance', 'ctr_opportunity']
const CTR_FALLBACK: Record<string, number> = { '1': 0.26, '2': 0.15, '3': 0.10, '4-5': 0.07, '6-10': 0.035, '11-20': 0.012, '21+': 0.005 }

export async function computeGscFindings(seo: any): Promise<Record<string, number>> {
  const pages = await fetchAll(seo, 'pages', 'id, normalized_url, cluster', (q) => q.is('removed_at', null))
  const pageByUrl = new Map<string, { id: number; cluster: string | null }>(pages.map((p: any) => [p.normalized_url, { id: p.id, cluster: p.cluster }]))

  // брендовые термины из settings (исключаем из CTR/позиций)
  const { data: bt } = await seo.from('settings').select('value').eq('key', 'brand_terms').maybeSingle()
  const brandTerms: string[] = (Array.isArray(bt?.value) ? bt!.value : ['goandstudy', 'go&study', 'гоэндстади', 'гоуэндстади', 'гоу энд стади', 'го энд стади']).map((s: string) => String(s).toLowerCase())
  const isBrand = (q: string) => { const s = q.toLowerCase(); return brandTerms.some((t) => s.includes(t)) }

  // агрегируем per (url, query): клики/показы/поз + позиции по дням (для std и каннибализации)
  type PQ = { clicks: number; impr: number; posw: number; byDay: Map<string, number> }
  const perPQ = new Map<string, PQ>()
  const SEP = ' '
  let dMin = '9999', dMax = '0'
  for (let from = 0; ; from += 1000) {
    const { data, error } = await seo.from('gsc_daily').select('normalized_url, query, clicks, impressions, position, date').range(from, from + 999)
    if (error) throw new Error(`gsc_daily: ${error.message}`)
    for (const r of data ?? []) {
      const k = `${r.normalized_url}${SEP}${r.query}`
      const a = perPQ.get(k) ?? { clicks: 0, impr: 0, posw: 0, byDay: new Map() }
      a.clicks += r.clicks || 0; a.impr += r.impressions || 0; a.posw += (r.position || 0) * (r.impressions || 0)
      if (r.date) { a.byDay.set(r.date, r.position || 0); if (r.date < dMin) dMin = r.date; if (r.date > dMax) dMax = r.date }
      perPQ.set(k, a)
    }
    if (!data || data.length < 1000) break
  }
  const windowDays = Math.max(1, (Date.parse(dMax) - Date.parse(dMin)) / 86400000 + 1)
  const to28 = 28 / windowDays

  // 1) собственная CTR-модель по бакету позиции (небрендовые, impr>=10).
  //    Эталон = пул сайта (сумма кликов / сумма показов) — устойчив к нулевому хвосту;
  //    p75 — 75-й перцентиль CTR среди пар с кликами (потолок «хорошего сниппета»).
  const bucketCtrs: Record<string, number[]> = {}
  const bucketClicks: Record<string, number> = {}, bucketImpr: Record<string, number> = {}
  for (const [k, a] of perPQ) {
    if (a.impr < 10) continue
    const query = k.slice(k.indexOf(SEP) + 1)
    if (isBrand(query)) continue
    const b = posBucket(a.posw / a.impr)
    bucketClicks[b] = (bucketClicks[b] || 0) + a.clicks
    bucketImpr[b] = (bucketImpr[b] || 0) + a.impr
    if (a.clicks > 0) (bucketCtrs[b] ??= []).push(a.clicks / a.impr)
  }
  const ctrModel: Record<string, { median: number; p75: number; n: number; basis: string }> = {}
  for (const b of ['1', '2', '3', '4-5', '6-10', '11-20', '21+']) {
    const impr = bucketImpr[b] || 0
    const pooled = impr > 0 ? bucketClicks[b] / impr : 0
    const p75 = percentile(bucketCtrs[b] || [], 0.75)
    ctrModel[b] = impr >= 1000
      ? { median: pooled, p75: Math.max(p75, pooled * 1.5), n: impr, basis: 'site_pooled' }
      : { median: CTR_FALLBACK[b], p75: CTR_FALLBACK[b] * 1.6, n: impr, basis: 'fallback' }
  }

  // 2) агрегируем per (url) -> его запросы (5.3)
  type QRow = { query: string; clicks: number; impr: number; pos: number; posStd: number; brand: boolean }
  const perUrl = new Map<string, QRow[]>()
  const queryUrls = new Map<string, string[]>()
  for (const [k, a] of perPQ) {
    if (a.impr < 20) continue
    const url = k.slice(0, k.indexOf(SEP)), query = k.slice(k.indexOf(SEP) + 1)
    const pos = a.posw / a.impr
    ;(perUrl.get(url) ?? perUrl.set(url, []).get(url)!).push({ query, clicks: a.clicks, impr: a.impr, pos, posStd: stdev([...a.byDay.values()]), brand: isBrand(query) })
    ;(queryUrls.get(query) ?? queryUrls.set(query, []).get(query)!).push(url)
  }

  const findings: { kind: string; confidence: string; page_ids: number[]; evidence: any }[] = []

  // 3) striking-distance - по URL: запросы на позиции 10.5-20.5, >=30 показов
  const strikingBuf: any[] = []
  for (const [url, rows] of perUrl) {
    const sd = rows.filter((r) => !r.brand && r.pos >= 10.5 && r.pos <= 20.5 && r.impr >= 30).sort((a, b) => b.impr - a.impr)
    if (!sd.length) continue
    const pg = pageByUrl.get(url)
    const totalImpr = sd.reduce((s, r) => s + r.impr, 0)
    const best = sd[0]
    strikingBuf.push({ kind: 'striking_distance', confidence: best.pos <= 15 ? 'high' : 'medium', page_ids: pg ? [pg.id] : [],
      evidence: { url, cluster: pg?.cluster ?? null, query: best.query, position: Math.round(best.pos * 10) / 10,
        impressions: totalImpr, queries_count: sd.length, top_queries: sd.slice(0, 5).map((r) => ({ q: r.query, pos: Math.round(r.pos * 10) / 10, impr: r.impr })) } })
  }
  strikingBuf.sort((a, b) => b.evidence.impressions - a.evidence.impressions)

  // 4) CTR-возможность - по URL: топ-10, >=100 показов, CTR ниже медианы на >=40%, позиция стабильна (5.2)
  const ctrBuf: any[] = []
  for (const [url, rows] of perUrl) {
    const cand = rows.filter((r) => !r.brand && r.pos <= 10 && r.impr >= 100 && r.posStd <= 1.5)
      .filter((r) => { const exp = ctrModel[posBucket(r.pos)].median; return exp > 0 && r.clicks / r.impr < exp * 0.6 })
    if (!cand.length) continue
    const pg = pageByUrl.get(url)
    let base = 0, cons = 0, opt = 0, impr = 0
    for (const r of cand) {
      const m = ctrModel[posBucket(r.pos)]; const actual = r.clicks / r.impr
      const gap = Math.max(0, m.median - actual)
      base += r.impr * gap; cons += r.impr * gap * 0.5; opt += r.impr * Math.max(gap, m.p75 - actual); impr += r.impr
    }
    const top = cand.sort((a, b) => b.impr - a.impr)[0]
    ctrBuf.push({ kind: 'ctr_opportunity', confidence: 'medium', page_ids: pg ? [pg.id] : [],
      evidence: { url, cluster: pg?.cluster ?? null, query: top.query, position: Math.round(top.pos * 10) / 10,
        impressions: impr, queries_count: cand.length,
        ctr: Math.round((top.clicks / top.impr) * 1000) / 1000, expected: Math.round(ctrModel[posBucket(top.pos)].median * 1000) / 1000,
        forecast: { conservative: Math.round(cons * to28), base: Math.round(base * to28), optimistic: Math.round(opt * to28), basis: 'доп. клики/28 дн при сохранении показов и позиций' } } })
  }
  ctrBuf.sort((a, b) => b.evidence.forecast.base - a.evidence.forecast.base)
  findings.push(...strikingBuf.slice(0, 120), ...ctrBuf.slice(0, 120))

  // 5) каннибализация (5.5): один интент - >=2 URL; чередование лидера + нестабильность позиции
  const cannib: any[] = []
  for (const [query, urlsRaw] of queryUrls) {
    if (isBrand(query)) continue
    const urls = [...new Set(urlsRaw)].filter((u) => (perPQ.get(`${u}${SEP}${query}`)?.impr || 0) >= 50)
    if (urls.length < 2) continue
    const leadDays: Record<string, number> = {}; let activeDays = 0
    const allDays = new Set<string>()
    for (const u of urls) for (const d of perPQ.get(`${u}${SEP}${query}`)!.byDay.keys()) allDays.add(d)
    for (const d of allDays) {
      let bestU = '', bestP = Infinity
      for (const u of urls) { const p = perPQ.get(`${u}${SEP}${query}`)!.byDay.get(d); if (p != null && p < bestP) { bestP = p; bestU = u } }
      if (bestU) { leadDays[bestU] = (leadDays[bestU] || 0) + 1; activeDays++ }
    }
    if (activeDays < 5) continue
    const shares = Object.values(leadDays).map((n) => n / activeDays).sort((a, b) => b - a)
    const alternation = shares.length >= 2 && shares[0] >= 0.4 && shares[1] >= 0.4
    const stats = urls.map((u) => { const a = perPQ.get(`${u}${SEP}${query}`)!; return { url: u, impr: a.impr, clicks: a.clicks, pos: a.posw / a.impr, std: stdev([...a.byDay.values()]) } }).sort((a, b) => b.impr - a.impr)
    const unstable = stats.slice(0, 2).every((s) => s.std > 1.5) || alternation
    const totalClicks = stats.reduce((s, x) => s + x.clicks, 0)
    if (totalClicks < 3) continue
    const confidence = alternation && unstable ? 'high' : 'medium'
    const pa = pageByUrl.get(stats[0].url), pb = pageByUrl.get(stats[1].url)
    cannib.push({ kind: 'cannibalization', confidence, page_ids: [pa?.id, pb?.id].filter(Boolean) as number[],
      evidence: { signal: 'gsc', query, urls: stats.slice(0, 3).map((s) => s.url),
        impressions: stats.slice(0, 3).map((s) => s.impr), clicks: stats.slice(0, 3).map((s) => s.clicks),
        positions: stats.slice(0, 3).map((s) => Math.round(s.pos * 10) / 10),
        alternation, lead_shares: shares.slice(0, 3).map((x) => Math.round(x * 100) / 100), active_days: activeDays,
        cluster: pa?.cluster ?? pb?.cluster ?? null,
        note: alternation ? 'URL чередуются в выдаче по запросу — вероятная каннибализация' : 'несколько URL по запросу; чередования нет — проверить интент (5.5)' } })
  }
  cannib.sort((a, b) => (b.evidence.impressions[0] || 0) - (a.evidence.impressions[0] || 0))
  findings.push(...cannib.slice(0, 120))

  // перезапись: striking/ctr целиком; каннибализацию — только GSC-версию (signal=gsc)
  await seo.from('findings').delete().in('kind', GSC_KINDS).eq('status', 'open').is('change_set_id', null)
  await seo.from('findings').delete().eq('kind', 'cannibalization').filter('evidence->>signal', 'eq', 'gsc').eq('status', 'open').is('change_set_id', null)
  const now = new Date().toISOString()
  const rows = findings.map((f) => ({ ...f, status: 'open', detected_at: now, last_seen_at: now }))
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await seo.from('findings').insert(rows.slice(i, i + 200))
    if (error) throw new Error(`gsc findings insert: ${error.message}`)
  }

  // сохранить CTR-модель в settings (для UI и переиспользования)
  await seo.from('settings').upsert({ key: 'ctr_model', value: { model: ctrModel, window_days: Math.round(windowDays), computed_from: `${dMin}..${dMax}` } as any }, { onConflict: 'key' })

  const counts: Record<string, number> = {}
  for (const f of findings) counts[f.kind] = (counts[f.kind] || 0) + 1
  return counts
}
