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

  // перезаписать открытые незанятые находки этих видов
  const kinds = ['orphan', 'duplicate_title', 'content_gap']
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
