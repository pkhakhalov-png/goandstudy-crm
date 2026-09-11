/**
 * Добыча тем из того, что уже происходит в поиске.
 *
 * Главный неиспользованный источник — двести тысяч строк запросов, по которым
 * сайт показывается. Если по семье запросов есть спрос, а лучшая наша страница
 * стоит на двадцатом месте или отвечает не на тот вопрос, это и есть тема.
 *
 * Частотность здесь настоящая, из Search Console, а не выдуманная. Данные по
 * Яндексу недоступны: Wordstat требует отдельного одобрения, Webmaster API —
 * отдельного токена. Пока их нет, источник помечается честно.
 */
import { stemsOf, sameFamily, type QueryRow } from './cannibal'

export type Candidate = {
  query: string
  family: string[]
  impressions: number
  clicks: number
  position: number
  /** Зачем читателю: узнать, выбрать, сделать. */
  intent: 'узнать' | 'выбрать' | 'сделать'
  /** Какая услуга стоит за темой — без этого статья не приводит клиентов. */
  service: string | null
  bestUrl: string | null
  reason: string
  source: 'gsc_gap'
}

/** Намерение читателя по формулировке. Грубо, но лучше, чем ничего. */
function intentOf(query: string): Candidate['intent'] {
  if (/^(как|что|чем|почему|зачем|сколько|когда|где|нужно ли|можно ли)/.test(query)) return 'узнать'
  if (/(лучш|рейтинг|топ|сравн|или|выбрать|дешев|стоит ли)/.test(query)) return 'выбрать'
  if (/(поступить|подать|оформить|получить|записаться|сдать|документы)/.test(query)) return 'сделать'
  return 'узнать'
}

/** Направление бизнеса по стране или теме в запросе. */
function serviceOf(query: string): string | null {
  const map: [RegExp, string][] = [
    [/китай|кнр|csc/i, 'поступление в Китай'],
    [/герман/i, 'поступление в Германию'],
    [/итали/i, 'поступление в Италию'],
    [/сша|америк/i, 'поступление в США'],
    [/англи|британ|великобритан|uk/i, 'поступление в Великобританию'],
    [/австри/i, 'поступление в Австрию'],
    [/оаэ|дубай|эмират/i, 'поступление в ОАЭ'],
    [/коре/i, 'поступление в Корею'],
    [/нидерланд|голланд/i, 'поступление в Нидерланды'],
    [/язык|ielts|toefl|hsk/i, 'языковые курсы'],
    [/грант|стипенди/i, 'гранты и стипендии'],
    [/виз/i, 'визовое сопровождение'],
  ]
  return map.find(([re]) => re.test(query))?.[1] ?? null
}

export type MineOptions = {
  /** Минимум показов у семьи, чтобы тема имела смысл. */
  minImpressions?: number
  /** Позиция, ниже которой считаем, что ответа у нас по сути нет. */
  weakPosition?: number
  limit?: number
}

/**
 * Собрать кандидатов. Тема годится, если по её семье есть спрос, а наша лучшая
 * страница стоит слабо — значит ответа, который ищут, у нас нет.
 */
export function mineCandidates(
  rows: QueryRow[],
  taken: string[],
  opts: MineOptions = {},
): Candidate[] {
  const minImpressions = opts.minImpressions ?? 120
  const weakPosition = opts.weakPosition ?? 11
  const limit = opts.limit ?? 40

  // Сводим по запросу: показы, клики, позиция и лучшая наша страница
  type Agg = { imp: number; clicks: number; posSum: number; best: { url: string; pos: number } | null }
  const byQuery = new Map<string, Agg>()
  for (const r of rows) {
    const q = String(r.query).toLowerCase()
    const a = byQuery.get(q) ?? { imp: 0, clicks: 0, posSum: 0, best: null }
    a.imp += r.impressions
    a.clicks += r.clicks
    a.posSum += Number(r.position ?? 0) * r.impressions
    if (!a.best || Number(r.position ?? 99) < a.best.pos) a.best = { url: r.normalized_url, pos: Number(r.position ?? 99) }
    byQuery.set(q, a)
  }

  // Собираем семьи: близкие формулировки считаем одной темой
  const queries = [...byQuery.entries()]
    .map(([query, a]) => ({ query, ...a, position: a.imp ? a.posSum / a.imp : 99 }))
    .filter((q) => q.imp >= 20 && stemsOf(q.query).length >= 2)
    .sort((a, b) => b.imp - a.imp)

  const families: { head: typeof queries[0]; members: typeof queries }[] = []
  for (const q of queries) {
    const found = families.find((f) => sameFamily(f.head.query, q.query))
    if (found) found.members.push(q)
    else families.push({ head: q, members: [q] })
  }

  const out: Candidate[] = []
  for (const f of families) {
    const impressions = f.members.reduce((s, m) => s + m.imp, 0)
    const clicks = f.members.reduce((s, m) => s + m.clicks, 0)
    if (impressions < minImpressions) continue

    // Взвешенная позиция по семье, а не по одному запросу
    const position = f.members.reduce((s, m) => s + m.position * m.imp, 0) / impressions
    if (position < weakPosition) continue                       // тут и так хорошо стоим

    if (taken.some((t) => sameFamily(t, f.head.query))) continue // уже есть или пишется

    out.push({
      query: f.head.query,
      family: f.members.slice(0, 6).map((m) => m.query),
      impressions, clicks, position,
      intent: intentOf(f.head.query),
      service: serviceOf(f.head.query),
      bestUrl: f.head.best?.url ?? null,
      reason: `${impressions} показов по ${f.members.length} запросам, наша лучшая позиция ${position.toFixed(1)}`
        + (clicks === 0 ? ', кликов нет вовсе' : `, кликов ${clicks}`),
      source: 'gsc_gap',
    })
  }

  return out.sort((a, b) => b.impressions - a.impressions).slice(0, limit)
}
