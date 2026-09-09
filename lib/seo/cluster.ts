// Тематическая кластеризация страниц по эмбеддингам (title+h1+meta).
// Сферический k-means (косинус): каждая индексируемая страница попадает ровно
// в один кластер. Имя кластера — самые характерные слова из тайтлов (TF/глоб.-TF).
// Пишет seo.pages.cluster. Никаких RPC — только PostgREST через переданный seo.

type Row = { id: number; normalized_url: string; title: string | null; page_type: string; embedding: any }

async function fetchAll(seo: any, table: string, cols: string, apply?: (q: any) => any): Promise<any[]> {
  const out: any[] = []
  let from = 0
  for (;;) {
    let q = seo.from(table).select(cols).range(from, from + 999)
    if (apply) q = apply(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
    from += 1000
  }
  return out
}

// детерминированный ГПСЧ (Math.random недоступен в part окружениях + нужна воспроизводимость)
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function normalize(v: number[]): number[] {
  let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1
  return v.map((x) => x / n)
}
function dot(a: number[], b: number[]): number { let d = 0; for (let k = 0; k < a.length; k++) d += a[k] * b[k]; return d }

// центроид = нормированное среднее назначенных векторов
function centroid(members: number[][], dim: number): number[] {
  const c = new Array(dim).fill(0)
  for (const v of members) for (let k = 0; k < dim; k++) c[k] += v[k]
  return normalize(c)
}

/** k-means++ инициализация по косинусу (детерминированная). */
function kppInit(vecs: number[][], k: number, rnd: () => number): number[][] {
  const first = Math.floor(rnd() * vecs.length)
  const centers: number[][] = [vecs[first]]
  while (centers.length < k) {
    // d² = (1 - maxCos) для каждой точки к ближайшему центру
    const d2 = vecs.map((v) => {
      let best = -1; for (const c of centers) { const s = dot(v, c); if (s > best) best = s }
      const dist = 1 - best; return dist * dist
    })
    const sum = d2.reduce((a, b) => a + b, 0) || 1
    let r = rnd() * sum, idx = 0
    for (let i = 0; i < d2.length; i++) { r -= d2[i]; if (r <= 0) { idx = i; break } idx = i }
    centers.push(vecs[idx])
  }
  return centers
}

function sphericalKmeans(vecs: number[][], k: number, seed: number, iters = 40): { assign: number[]; centers: number[][] } {
  const dim = vecs[0].length
  const rnd = mulberry32(seed)
  let centers = kppInit(vecs, k, rnd)
  let assign = new Array(vecs.length).fill(0)
  for (let it = 0; it < iters; it++) {
    let moved = 0
    for (let i = 0; i < vecs.length; i++) {
      let best = -Infinity, bi = 0
      for (let c = 0; c < centers.length; c++) { const s = dot(vecs[i], centers[c]); if (s > best) { best = s; bi = c } }
      if (assign[i] !== bi) { assign[i] = bi; moved++ }
    }
    // пересчёт центров; пустой кластер — переинициализируем худшей точкой
    const groups: number[][][] = Array.from({ length: k }, () => [])
    for (let i = 0; i < vecs.length; i++) groups[assign[i]].push(vecs[i])
    centers = groups.map((g, c) => (g.length ? centroid(g, dim) : centers[c]))
    if (moved === 0 && it > 0) break
  }
  return { assign, centers }
}

// суммарная связность (среднее косинус-сходство точки со своим центром) — для выбора k
function cohesion(vecs: number[][], assign: number[], centers: number[][]): number {
  let s = 0; for (let i = 0; i < vecs.length; i++) s += dot(vecs[i], centers[assign[i]])
  return s / vecs.length
}

const STOP = new Set([
  'и','в','во','не','что','он','на','я','с','со','как','а','то','все','она','так','его','но','да','ты','к','у','же','вы','за','бы','по','ее','мне','было','вот','от','о','из','ему','для','до','или','the','a','an','of','for','in','on','to','and','or','with','your','you','how','what','best','top','guide','vs','&','—','-','·','|','гид','лучшие','как','что','это','наш','наши','гоу','study','goandstudy',
  'какие','какой','какая','чем','где','когда','почему','зачем','нужно','можно','года','году','лет','про','при','обзор','топ','список','всё','ваш','ваша','ваши',
])
function tokens(s: string | null): string[] {
  return (s || '').toLowerCase().replace(/[«»"'(),.:;!?/\\]+/g, ' ').split(/\s+/)
    .map((t) => t.trim()).filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t))
}

/** Дать кластерам характерные имена по тайтлам (термин с макс. cluster_tf / global_tf). */
function nameClusters(rows: Row[], assign: number[], k: number): string[] {
  const globalTf = new Map<string, number>()
  const clusterTf: Map<string, number>[] = Array.from({ length: k }, () => new Map())
  rows.forEach((r, i) => {
    for (const t of new Set(tokens(r.title))) {
      globalTf.set(t, (globalTf.get(t) || 0) + 1)
      const m = clusterTf[assign[i]]; m.set(t, (m.get(t) || 0) + 1)
    }
  })
  const used = new Set<string>()
  const names: string[] = []
  const stem = (t: string) => t.slice(0, 5)   // грубая дедупликация однокоренных форм
  for (let c = 0; c < k; c++) {
    const scored = [...clusterTf[c].entries()]
      .map(([t, n]) => ({ t, score: n / Math.sqrt(globalTf.get(t) || 1), n }))
      .sort((a, b) => b.score - a.score)
    const strong = scored.filter((s) => s.n >= 2)
    let name = ''
    const picked: string[] = []
    for (const { t } of strong) {
      if (used.has(t)) continue
      if (picked.some((p) => stem(p) === stem(t))) continue   // не берём однокоренное
      picked.push(t); used.add(t)
      if (picked.length === 2) break
    }
    name = picked.join(' · ')
    // фолбэк: если нет сильных слов — берём самое характерное вообще (даже n=1)
    if (!name && scored.length) { name = scored[0].t; used.add(scored[0].t) }
    names.push(name || `кластер ${c + 1}`)
  }
  return names
}

export type Centroid = { name: string; size: number; centroid: number[] }

/** Загрузить сохранённые центроиды кластеров (из settings). */
export async function loadCentroids(seo: any): Promise<Centroid[]> {
  const { data } = await seo.from('settings').select('value').eq('key', 'cluster_centroids').maybeSingle()
  return (data?.value as Centroid[]) || []
}

/** Отнести вектор к ближайшему кластеру (косинус). Возвращает имя и score, либо null. */
export function assignCluster(vec: number[], centroids: Centroid[]): { name: string; score: number } | null {
  if (!centroids.length) return null
  const v = normalize(vec)
  let best = -Infinity, name = ''
  for (const c of centroids) { const s = dot(v, normalize(c.centroid)); if (s > best) { best = s; name = c.name } }
  return { name, score: Math.round(best * 1000) / 1000 }
}

export type ClusterResult = { k: number; cohesion: number; distribution: { name: string; count: number }[] }

/** Кластеризовать страницы и записать seo.pages.cluster. k=0 → авто-подбор по связности. */
export async function computeClusters(seo: any, opts: { k?: number; seed?: number } = {}): Promise<ClusterResult> {
  const seed = opts.seed ?? 42
  const rows: Row[] = await fetchAll(seo, 'pages', 'id, normalized_url, title, page_type, embedding',
    (q) => q.not('embedding', 'is', null).is('removed_at', null).order('id', { ascending: true }))
  if (rows.length < 2) return { k: 0, cohesion: 0, distribution: [] }

  const vecs = rows.map((r) => normalize(typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding))

  // выбор k: заданный или авто (лучшая связность с «локтевым» штрафом за дробление)
  let k = opts.k ?? 0
  let best: { assign: number[]; centers: number[][] } | null = null
  if (k >= 2) {
    best = sphericalKmeans(vecs, Math.min(k, rows.length), seed)
  } else {
    const candidates = [6, 8, 10, 12, 14, 16].filter((c) => c < rows.length)
    let bestScore = -Infinity
    for (const c of candidates) {
      const r = sphericalKmeans(vecs, c, seed)
      // связность минус мягкий штраф за число кластеров (эвристика «локтя»)
      const score = cohesion(vecs, r.assign, r.centers) - 0.006 * c
      if (score > bestScore) { bestScore = score; best = r; k = c }
    }
  }
  const { assign, centers } = best!
  const names = nameClusters(rows, assign, k)

  // размеры кластеров
  const sizes = new Array(k).fill(0)
  for (const a of assign) sizes[a]++

  // сохранить центроиды в settings — чтобы новые топики/статьи мгновенно относились к теме
  const centroidPayload = names.map((name, c) => ({ name, size: sizes[c], centroid: centers[c] }))
  await seo.from('settings').upsert({ key: 'cluster_centroids', value: centroidPayload as any }, { onConflict: 'key' })

  // запись pages.cluster батчами по id
  const now = new Date().toISOString()
  void now
  const updates = new Map<string, number[]>()   // name → ids
  rows.forEach((r, i) => {
    const nm = names[assign[i]]
    ;(updates.get(nm) ?? updates.set(nm, []).get(nm)!).push(r.id)
  })
  for (const [nm, ids] of updates) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await seo.from('pages').update({ cluster: nm }).in('id', ids.slice(i, i + 200))
      if (error) throw new Error(`cluster update: ${error.message}`)
    }
  }

  const distribution = [...updates.entries()].map(([name, ids]) => ({ name, count: ids.length }))
    .sort((a, b) => b.count - a.count)
  return { k, cohesion: Math.round(cohesion(vecs, assign, centers) * 1000) / 1000, distribution }
}
