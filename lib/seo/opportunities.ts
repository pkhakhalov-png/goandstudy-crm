// Единая приоритизированная очередь возможностей (PRD v2.0 §7) как ВЫЧИСЛЯЕМОЕ
// представление поверх seo.findings. Полноценная таблица seo.opportunities +
// Decision Engine — этап 2 PRD (нужна миграция 011); здесь — read-model, который
// уже сейчас превращает разрозненные находки в один план действий по URL/интенту.

type Finding = { id: number; kind: string; confidence: string; page_ids: number[]; evidence: any }

export type Opportunity = {
  key: string
  scope: 'url' | 'query' | 'site'
  url: string | null
  page_ids: number[]
  cluster: string | null
  decision: string          // UPDATE | EXPAND | MERGE | REPOSITION | SCHEMA | FIX | LINK_ONLY | CREATE
  decision_reason: string
  risk: 'low' | 'medium' | 'high'
  priority: number          // условные баллы, отсортировано по убыванию
  forecast: { conservative: number; base: number; optimistic: number } | null
  kinds: string[]
  evidence: any
}

const short = (u: string | null) => (u || '').replace('https://goandstudy.com', '') || '/'

// решение и риск по доминирующему виду находки (Decision Engine упрощённо)
function decisionFor(kind: string): { decision: string; risk: Opportunity['risk'] } {
  switch (kind) {
    case 'technical_critical': return { decision: 'FIX', risk: 'high' }
    case 'cannibalization': return { decision: 'MERGE/REPOSITION', risk: 'high' }
    case 'ctr_opportunity': return { decision: 'UPDATE', risk: 'low' }       // сниппет
    case 'striking_distance': return { decision: 'EXPAND', risk: 'medium' }
    case 'missing_schema': return { decision: 'SCHEMA', risk: 'low' }
    case 'orphan': return { decision: 'LINK_ONLY', risk: 'low' }
    case 'content_gap': return { decision: 'CREATE', risk: 'medium' }
    case 'broken_link': return { decision: 'FIX', risk: 'medium' }
    default: return { decision: 'UPDATE', risk: 'low' }
  }
}

// вклад находки в приоритет (условные баллы «ожидаемой ценности»)
function scoreOf(f: Finding): number {
  const e = f.evidence || {}
  const impr = e.impressions || 0
  switch (f.kind) {
    case 'technical_critical': return 5000 + impr            // критично — всегда наверх
    case 'ctr_opportunity': return (e.forecast?.base || 0) * 30     // прямая ценность в кликах/год
    case 'cannibalization': return (f.confidence === 'high' ? 40 : 12) * (Array.isArray(e.impressions) ? e.impressions[0] || 0 : impr) / 100
    case 'striking_distance': return impr * 0.15
    case 'missing_schema': return impr * 0.02
    case 'broken_link': return 300
    case 'orphan': return 80
    case 'duplicate_title': return 60
    case 'title_length': return 20
    case 'missing_meta_desc': return 40
    case 'missing_h1': return 50
    case 'thin_content': return impr * 0.05 + 30
    default: return 10
  }
}

// порядок «важности» вида — для выбора доминирующего решения по URL
const KIND_RANK = ['technical_critical', 'cannibalization', 'ctr_opportunity', 'striking_distance',
  'missing_h1', 'thin_content', 'missing_meta_desc', 'missing_schema', 'title_length', 'orphan']
const rankOf = (k: string) => { const i = KIND_RANK.indexOf(k); return i < 0 ? 99 : i }

/** Свести открытые находки к приоритизированным возможностям. Чистая функция. */
export function computeOpportunities(findings: Finding[]): Opportunity[] {
  const opps: Opportunity[] = []

  // 1) каннибализация — отдельная возможность на запрос (охватывает 2–3 URL)
  for (const f of findings) {
    if (f.kind !== 'cannibalization') continue
    const e = f.evidence || {}
    const { decision, risk } = decisionFor('cannibalization')
    opps.push({
      key: `cannib:${e.query}`, scope: 'query', url: null, page_ids: f.page_ids || [], cluster: e.cluster ?? null,
      decision: f.confidence === 'high' ? 'MERGE/REPOSITION' : 'REVIEW', risk,
      decision_reason: e.alternation ? `«${e.query}»: URL чередуются в выдаче (${JSON.stringify(e.lead_shares)}) — вероятная каннибализация` : `«${e.query}»: несколько URL ранжируются, проверить интент (§5.5)`,
      priority: scoreOf(f), forecast: null, kinds: ['cannibalization'],
      evidence: { query: e.query, urls: (e.urls || []).map(short), positions: e.positions, impressions: e.impressions, confidence: f.confidence },
    })
  }

  // 2) прочие находки — группируем по URL
  const byUrl = new Map<string, Finding[]>()
  const siteWide: Finding[] = []
  for (const f of findings) {
    if (f.kind === 'cannibalization') continue
    const url = f.evidence?.url || null
    if (!url) { siteWide.push(f); continue }
    ;(byUrl.get(url) ?? byUrl.set(url, []).get(url)!).push(f)
  }

  for (const [url, fs] of byUrl) {
    const dominant = [...fs].sort((a, b) => rankOf(a.kind) - rankOf(b.kind))[0]
    const { decision, risk } = decisionFor(dominant.kind)
    const priority = fs.reduce((s, f) => s + scoreOf(f), 0)
    const ctr = fs.find((f) => f.kind === 'ctr_opportunity')
    const cluster = fs.map((f) => f.evidence?.cluster).find(Boolean) ?? null
    const kinds = [...new Set(fs.map((f) => f.kind))]
    const reasons: Record<string, string> = {
      technical_critical: 'критическая техпроблема — чинить первой',
      ctr_opportunity: 'в топ-10, но кликают ниже медианы сайта — переписать title/description',
      striking_distance: 'позиции 11–20 — усилить контент и перелинковку до топ-10',
      missing_schema: 'нет schema.org — добавить разметку по типу',
      orphan: 'нет входящих ссылок — добавить перелинковку',
    }
    const pageIds = [...new Set(fs.flatMap((f) => f.page_ids || []))]
    opps.push({
      key: `url:${url}`, scope: 'url', url, page_ids: pageIds, cluster,
      decision, decision_reason: reasons[dominant.kind] || `основное: ${dominant.kind}`, risk,
      priority, forecast: ctr?.evidence?.forecast ?? null, kinds,
      evidence: { url: short(url), findings: kinds, impressions: Math.max(0, ...fs.map((f) => f.evidence?.impressions || 0)) },
    })
  }

  // 3) site-wide (llms/robots/content_gap) — низкий приоритет, но в очереди
  for (const f of siteWide) {
    const { decision, risk } = decisionFor(f.kind)
    opps.push({
      key: `site:${f.kind}:${f.id}`, scope: 'site', url: null, page_ids: f.page_ids || [], cluster: f.evidence?.cluster ?? null,
      decision, decision_reason: f.evidence?.note || f.kind, risk,
      priority: scoreOf(f), forecast: null, kinds: [f.kind], evidence: f.evidence,
    })
  }

  return opps.sort((a, b) => b.priority - a.priority)
}

/**
 * Пересчитать и записать возможности в seo.opportunities.
 * Идемпотентно: удаляет только необработанные (status='new'), сохраняет решённые человеком
 * (approved/queued/dismissed/…). Возвращает счётчики.
 */
export async function persistOpportunities(seo: any): Promise<{ inserted: number; kept: number }> {
  const { data: findings, error } = await seo.from('findings').select('id, kind, confidence, page_ids, evidence, status').eq('status', 'open').limit(5000)
  if (error) throw new Error(`findings: ${error.message}`)
  const opps = computeOpportunities((findings ?? []) as any[])

  const { count: kept } = await seo.from('opportunities').select('*', { count: 'exact', head: true }).neq('status', 'new')
  await seo.from('opportunities').delete().eq('status', 'new')

  const now = new Date().toISOString()
  const rows = opps.map((o) => ({
    kind: o.kinds[0], page_ids: o.page_ids.length ? o.page_ids : null,
    query_group: o.scope === 'query' ? [o.evidence?.query].filter(Boolean) : o.kinds,
    decision: o.decision, decision_reason: o.decision_reason, risk: o.risk,
    priority: Math.round(o.priority), forecast: o.forecast, evidence: { ...o.evidence, scope: o.scope, url: o.url, cluster: o.cluster },
    status: 'new', created_at: now, updated_at: now,
  }))
  for (let i = 0; i < rows.length; i += 200) {
    const { error: e } = await seo.from('opportunities').insert(rows.slice(i, i + 200))
    if (e) throw new Error(`opportunities insert: ${e.message}`)
  }
  return { inserted: rows.length, kept: kept || 0 }
}
