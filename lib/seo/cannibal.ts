/**
 * Каннибализация: не отберёт ли новая статья запросы у уже существующей.
 *
 * Сравнение текстов целиком отвечает на другой вопрос — «похожи ли статьи».
 * Две статьи могут быть совершенно разными и всё равно драться за один запрос,
 * и наоборот. Поэтому смотрим не на тексты, а на запросы: по каким из них сайт
 * уже показывается и какая страница их держит.
 *
 * Итог — один из трёх:
 *   safe   — семью запросов никто не занимает, можно писать;
 *   update — запросы уже держит своя страница, новую писать нельзя: обновляем ту;
 *   risky  — запросы размазаны между несколькими своими страницами, это уже
 *            каннибализация, и новая статья её усилит.
 */
export type Owner = {
  url: string
  impressions: number
  clicks: number
  position: number
  /** Какую долю показов семьи держит эта страница. */
  share: number
}

export type CannibalVerdict = {
  verdict: 'safe' | 'update' | 'risky'
  reason: string
  familySize: number
  familyImpressions: number
  owners: Owner[]
  /** Страница, которую следует обновить вместо написания новой. */
  updateTarget: string | null
}

/** Основы слов запроса: по ним собирается семья родственных запросов. */
export function stemsOf(query: string): string[] {
  return query.toLowerCase().split(/[^\p{L}\d]+/u).filter((w) => w.length >= 4).map((w) => w.slice(0, 5))
}

/** Читает таблицу целиком: обычный select обрезал бы выдачу на тысяче строк. */
async function readAll(seo: any, table: string, cols: string, since?: string): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    let q = seo.from(table).select(cols).range(from, from + 999)
    if (since) q = q.gte('date', since)
    const { data, error } = await q
    if (error || !data?.length) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

export type QueryRow = { normalized_url: string; query: string; clicks: number; impressions: number; position: number }

/**
 * Запросные строки за период — читаются один раз. Проверять темы по одной,
 * каждый раз перечитывая двести тысяч строк, слишком дорого.
 */
export async function loadQueryRows(seo: any, days = 90): Promise<QueryRow[]> {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)
  return readAll(seo, 'gsc_daily', 'normalized_url,query,clicks,impressions,position,date', since)
}

export async function checkCannibalization(
  seo: any,
  query: string,
  opts: { days?: number; excludeUrl?: string; rows?: QueryRow[] } = {},
): Promise<CannibalVerdict> {
  const rows = opts.rows ?? (await loadQueryRows(seo, opts.days ?? 90))
  return verdictFor(rows, query, opts.excludeUrl)
}

export function verdictFor(rows: QueryRow[], query: string, excludeUrl?: string): CannibalVerdict {
  const stems = stemsOf(query)
  const opts = { excludeUrl }

  if (!stems.length) {
    return { verdict: 'safe', reason: 'запрос слишком короткий для разбора', familySize: 0, familyImpressions: 0, owners: [], updateTarget: null }
  }

  // Семья: запросы, где совпадает больше половины основ. Так «обучение в
  // австрии» и «высшее образование в австрии» попадают в одну семью, а
  // «обучение в италии» — нет.
  const family = new Map<string, number>()
  const byPage = new Map<string, { imp: number; clicks: number; posSum: number; n: number }>()

  for (const r of rows) {
    const q = String(r.query).toLowerCase()
    const hit = stems.filter((st) => q.includes(st)).length / stems.length
    if (hit < 0.6) continue
    if (opts.excludeUrl && r.normalized_url === opts.excludeUrl) continue

    family.set(q, (family.get(q) ?? 0) + (r.impressions ?? 0))
    const p = byPage.get(r.normalized_url) ?? { imp: 0, clicks: 0, posSum: 0, n: 0 }
    p.imp += r.impressions ?? 0
    p.clicks += r.clicks ?? 0
    p.posSum += Number(r.position ?? 0) * (r.impressions ?? 0)
    p.n += r.impressions ?? 0
    byPage.set(r.normalized_url, p)
  }

  const familyImpressions = [...family.values()].reduce((a, b) => a + b, 0)
  if (familyImpressions === 0) {
    return {
      verdict: 'safe',
      reason: 'по этой семье запросов сайт пока не показывается — свободно',
      familySize: family.size, familyImpressions: 0, owners: [], updateTarget: null,
    }
  }

  const owners: Owner[] = [...byPage.entries()]
    .map(([url, p]) => ({
      url, impressions: p.imp, clicks: p.clicks,
      position: p.n > 0 ? p.posSum / p.n : 0,
      share: p.imp / familyImpressions,
    }))
    .filter((o) => o.impressions > 0)
    .sort((a, b) => b.impressions - a.impressions)

  const top = owners[0]
  const second = owners[1]

  // Уже дерутся между собой: две страницы держат сопоставимые доли одной семьи
  if (second && second.share >= 0.2 && top.share <= 0.7) {
    return {
      verdict: 'risky',
      reason: `запросы разделены между своими страницами (${Math.round(top.share * 100)}% и ${Math.round(second.share * 100)}%) — это уже каннибализация, новая статья её усилит`,
      familySize: family.size, familyImpressions, owners: owners.slice(0, 5),
      updateTarget: top.url,
    }
  }

  // Семью уверенно держит своя страница — новую писать незачем
  if (top.share >= 0.5 && top.impressions >= 50) {
    return {
      verdict: 'update',
      reason: `${Math.round(top.share * 100)}% показов семьи держит своя страница (позиция ${top.position.toFixed(1)}) — её и надо обновлять, а не писать новую`,
      familySize: family.size, familyImpressions, owners: owners.slice(0, 5),
      updateTarget: top.url,
    }
  }

  return {
    verdict: 'safe',
    reason: owners.length
      ? `семью держат слабо (лучшая своя страница — ${Math.round(top.share * 100)}% показов, позиция ${top.position.toFixed(1)}), новая статья не отберёт заметного`
      : 'своих страниц по этой семье нет',
    familySize: family.size, familyImpressions, owners: owners.slice(0, 5), updateTarget: null,
  }
}
