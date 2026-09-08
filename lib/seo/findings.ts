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
}

// Пороговые значения (из чеклистов; в символах/словах)
const TITLE_MIN = 20, TITLE_MAX = 65        // ~200-600px → символьное приближение
const META_MIN = 70, META_MAX = 160
const THIN_WORDS = 300                       // seo-content: тонкий контент

const TECH_KINDS = [
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
      'id, normalized_url, indexable, page_type, title, h1, meta_desc, word_count, has_schema',
      (q) => q.is('removed_at', null),
    )
  } catch (e: any) {
    if (!/has_schema|column|PGRST/i.test(e?.message || '')) throw e
    const base = await fetchAll(
      seo, 'pages',
      'id, normalized_url, indexable, page_type, title, h1, meta_desc, word_count',
      (q) => q.is('removed_at', null),
    )
    pages = base.map((p: any) => ({ ...p, has_schema: null }))
  }
  const findings: { kind: string; confidence: string; page_ids: number[]; evidence: any }[] = []
  const add = (kind: string, confidence: string, id: number, url: string, extra: any = {}) =>
    findings.push({ kind, confidence, page_ids: [id], evidence: { url, ...extra } })

  const isContent = (t: string) => t === 'article' || t === 'service' || t === 'landing' || t === 'commercial'

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

    // has_schema === false → точно нет JSON-LD; null → страница краулилась до появления колонки, пропускаем
    if (p.has_schema === false && isContent(p.page_type))
      add('missing_schema', 'medium', p.id, p.normalized_url, { page_type: p.page_type, note: 'нет JSON-LD; рекомендуется ' + (p.page_type === 'article' ? 'Article/BlogPosting' : 'Service/Course') })
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
  const pages: Page[] = await fetchAll(seo, 'pages', 'id, normalized_url, indexable, page_type, title, content_hash', (q) => q.is('removed_at', null))
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
  for (const [url, m] of missing) {
    findings.push({ kind: 'content_gap', confidence: 'low', page_ids: [],
      evidence: { missing_url: url, linked_from_count: m.from.size, anchors: [...m.anchors].slice(0, 5), reason: 'internal link to non-inventoried URL' } })
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

  // перезаписать открытые незанятые находки этих видов
  const kinds = ['orphan', 'duplicate_title', 'content_gap', 'cannibalization']
  await seo.from('findings').delete().in('kind', kinds).eq('status', 'open').is('change_set_id', null)
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
