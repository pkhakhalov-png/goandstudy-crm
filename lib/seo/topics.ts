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
export async function createTopicWithCluster(seo: any, input: CreateTopicInput, precomputedVec?: number[]): Promise<CreateTopicResult> {
  const title = (input.title || '').trim()
  if (!title) return { topic_id: null, cluster: null, cluster_score: null, status: 'error', duplicates: [], link_targets: [], error: 'нет заголовка' }

  const text = [title, input.primary_keyword].filter(Boolean).join(' — ').slice(0, 2000)
  const vec = precomputedVec ?? (await embed([text]))[0]

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

function titleCaseSlug(u: string): string {
  try { const seg = new URL(u).pathname.split('/').filter(Boolean).pop() || ''; const s = decodeURIComponent(seg).replace(/[-_]+/g, ' ').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : '' } catch { return '' }
}

// служебные/навигационные анкоры — не тема статьи
const GENERIC_ANCHOR = new Set(['подробнее', 'подробно', 'читать', 'читать далее', 'далее', 'здесь', 'тут', 'перейти', 'узнать', 'узнать больше', 'смотреть', 'ещё', 'еще', 'разбор', 'пошаговый разбор', 'ссылка', 'подробный разбор', 'по ссылке', 'на сайте', 'подробнее по ссылке', 'подробнее об аспирантуре', 'подробнее о магистратуре', 'подробнее о бакалавриате'])
// CTA/транзакционные анкоры — не темы статей
const CTA = /оплатит|записат|купит|заказат|заявк|консультац|связат|забронир|начать|отправит|подписат|₽|руб|\$/i
function cleanAnchor(a: string): string {
  return a.replace(/[→←↔»«•·|]+/g, ' ').replace(/\s+/g, ' ').replace(/^(подробнее|подробно|читать|далее)\s+(об?|о|про)\s+/i, '').replace(/[\s—-]+$/, '').trim()
}
function isGoodTopic(title: string): boolean {
  const t = cleanAnchor(title).toLowerCase()
  return t.length >= 8 && !GENERIC_ANCHOR.has(t) && /[а-я]{4}/i.test(t) && !CTA.test(t)   // требуем кириллицу, без CTA/транслита
}

/**
 * Создать кандидаты статей из находок content_gap (внутренние ссылки на несуществующие URL) — PRD §7.1.
 * Заголовок берётся из анкора (что искал пользователь) или из слага URL. Идемпотентно по ключу.
 * Каждая тема относится к кластеру, дубли отсекаются (createTopicWithCluster).
 */
export async function topicsFromContentGaps(seo: any): Promise<{ created: number; skipped: number; duplicates: number }> {
  const { data: gaps } = await seo.from('findings').select('evidence').eq('kind', 'content_gap').eq('status', 'open').limit(500)
  const { data: existing } = await seo.from('topics').select('primary_keyword, title')
  const seen = new Set<string>()
  for (const t of existing ?? []) { if (t.primary_keyword) seen.add(String(t.primary_keyword).toLowerCase()); if (t.title) seen.add(String(t.title).toLowerCase()) }

  // отбираем уникальные кандидаты
  const cands: { title: string; anchor: string }[] = []
  let skipped = 0
  for (const g of gaps ?? []) {
    const e = g.evidence || {}
    const rawAnchor = (e.anchors && e.anchors[0]) ? String(e.anchors[0]).trim() : ''
    const anchor = cleanAnchor(rawAnchor)
    const title = isGoodTopic(anchor) ? anchor : titleCaseSlug(e.missing_url || '')
    if (!isGoodTopic(title)) { skipped++; continue }
    const key = title.toLowerCase()
    if (seen.has(key)) { skipped++; continue }
    seen.add(key)
    cands.push({ title, anchor: isGoodTopic(anchor) ? anchor : '' })
  }

  // батч-эмбеддинг всех заголовков (обход rate-limit: один запрос на пачку)
  let created = 0, duplicates = 0
  for (let i = 0; i < cands.length; i += 100) {
    const batch = cands.slice(i, i + 100)
    const vecs = await embed(batch.map((c) => [c.title, c.anchor].filter(Boolean).join(' — ').slice(0, 2000)))
    for (let j = 0; j < batch.length; j++) {
      const res = await createTopicWithCluster(seo, { title: batch[j].title, primary_keyword: batch[j].anchor || undefined }, vecs[j])
      if (res.status === 'rejected_duplicate') duplicates++
      else if (res.topic_id) created++
      else skipped++
    }
  }
  return { created, skipped, duplicates }
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
