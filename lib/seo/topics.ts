// Создание темы статьи с учётом кластеров: новая статья сразу относится к теме,
// проверяется на дубли (каннибализацию) и получает кандидатов внутренней перелинковки
// из своего кластера. Пишет seo.topics. Эмбеддинг темы — title + primary_keyword.
import { embed, toPgVector } from './embeddings'
import { loadCentroids, assignCluster } from './cluster'

const DUP_THRESH = 0.80   // тот же порог, что и для находки cannibalization

type Cand = { id: number; normalized_url: string; title: string | null; cluster: string | null; embedding: any }

function cos(a: number[], b: number[]): number {
  let d = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return d / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

export type CreateTopicInput = { title: string; primary_keyword?: string; intent?: string; requested_by?: number }
export type CreateTopicResult = {
  topic_id: number | null
  cluster: string | null
  cluster_score: number | null
  status: string
  duplicates: { url: string; title: string | null; cosine: number }[]
  link_targets: { url: string; title: string | null; cosine: number }[]
  error?: string
}

/**
 * Создать тему статьи, привязав её к кластеру.
 * - относит тему к ближайшему кластеру (по центроидам из settings);
 * - помечает status='rejected_duplicate', если есть страница с cosine ≥ 0.80 (уже покрыто);
 * - предлагает внутренние ссылки из того же кластера.
 */
export async function createTopicWithCluster(seo: any, input: CreateTopicInput): Promise<CreateTopicResult> {
  const title = (input.title || '').trim()
  if (!title) return { topic_id: null, cluster: null, cluster_score: null, status: 'error', duplicates: [], link_targets: [], error: 'нет заголовка' }

  const text = [title, input.primary_keyword].filter(Boolean).join(' — ').slice(0, 2000)
  const vec = (await embed([text]))[0]

  // кластер по сохранённым центроидам
  const centroids = await loadCentroids(seo)
  const assigned = assignCluster(vec, centroids)

  // кандидаты: страницы с эмбеддингом (для дублей — по всему сайту, для линковки — свой кластер)
  const cands: Cand[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await seo.from('pages').select('id, normalized_url, title, cluster, embedding')
      .not('embedding', 'is', null).is('removed_at', null).range(from, from + 999)
    for (const p of data ?? []) cands.push(p)
    if (!data || data.length < 1000) break
  }
  const scored = cands.map((p) => {
    let e = p.embedding
    try { e = typeof e === 'string' ? JSON.parse(e) : e } catch { e = null }
    return { p, cos: e ? cos(vec, e) : 0 }
  }).sort((a, b) => b.cos - a.cos)

  const duplicates = scored.filter((s) => s.cos >= DUP_THRESH).slice(0, 5)
    .map((s) => ({ url: s.p.normalized_url, title: s.p.title, cosine: Math.round(s.cos * 1000) / 1000 }))

  const link_targets = scored
    .filter((s) => s.cos < DUP_THRESH && s.cos >= 0.45 && (!assigned || s.p.cluster === assigned.name))
    .slice(0, 6)
    .map((s) => ({ url: s.p.normalized_url, title: s.p.title, cosine: Math.round(s.cos * 1000) / 1000 }))

  const status = duplicates.length ? 'rejected_duplicate' : 'new'
  const { data: ins, error } = await seo.from('topics').insert({
    title,
    primary_keyword: input.primary_keyword || null,
    cluster: assigned?.name ?? null,
    intent: input.intent || null,
    origin: 'manual',
    status,
    duplicate_of: null,
    requested_by: input.requested_by ?? null,
    embedding: toPgVector(vec),
  }).select('id').single()
  if (error) return { topic_id: null, cluster: assigned?.name ?? null, cluster_score: assigned?.score ?? null, status: 'error', duplicates, link_targets, error: error.message }

  return {
    topic_id: ins.id,
    cluster: assigned?.name ?? null,
    cluster_score: assigned?.score ?? null,
    status,
    duplicates,
    link_targets,
  }
}

/** Пере-назначить кластеры всем темам по сохранённым центроидам (после пересчёта кластеров). */
export async function reclusterTopics(seo: any): Promise<{ updated: number }> {
  const centroids = await loadCentroids(seo)
  if (!centroids.length) return { updated: 0 }
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await seo.from('topics').select('id, embedding').not('embedding', 'is', null).range(from, from + 999)
    for (const t of data ?? []) rows.push(t)
    if (!data || data.length < 1000) break
  }
  let updated = 0
  for (const t of rows) {
    let e = t.embedding
    try { e = typeof e === 'string' ? JSON.parse(e) : e } catch { e = null }
    if (!e) continue
    const a = assignCluster(e, centroids)
    if (a) { await seo.from('topics').update({ cluster: a.name }).eq('id', t.id); updated++ }
  }
  return { updated }
}
