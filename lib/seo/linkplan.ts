// §8.9: у новой статьи должно быть минимум 2 входящие ссылки с существующих страниц,
// иначе она сирота. Здесь — подбор страниц-доноров и точки вставки.
//
// Вставка в живые страницы делается только через change_set с подтверждением человека:
// это правка существующего работающего контента, а по §13.5 страницы из топ-10 вообще
// правит только человек.
import { embed } from './embeddings'

export type Donor = {
  pageId: number
  url: string
  title: string | null
  similarity: number
  anchor: string
  /** Нашлась ли в тексте страницы фраза, в которую можно вшить ссылку. */
  insertionPoint: string | null
  status: 'proposed' | 'manual_required'
  reason: string
}

export type LinkPlanInput = {
  targetTitle: string
  targetH1: string
  targetSlug: string
  /** Слова, которые годятся в анкор: из брифа. */
  anchorCandidates: string[]
  pages: { id: number; url: string; title: string | null; vec: number[]; text?: string | null }[]
  /** Страницы, которые уже ссылаются на цель, — их не трогаем. */
  alreadyLinking: Set<number>
  min?: number
  /**
   * Текста страниц в инвентаре нет (хранятся только title/h1/meta), а без текста
   * место вставки не найти. Поэтому короткому списку кандидатов текст догружаем.
   */
  fetchText?: (url: string) => Promise<string | null>
}

export async function planIncomingLinks(input: LinkPlanInput): Promise<Donor[]> {
  const min = input.min ?? 2
  const [targetVec] = await embed([`${input.targetTitle}. ${input.targetH1}`])

  // В инвентаре несколько normalized_url могут указывать на одну живую страницу
  // (следствие 301-редиректов). Без схлопывания в план попадёт один и тот же донор
  // пять раз — что и случилось на первом прогоне.
  const seenUrl = new Set<string>()
  const unique = input.pages.filter((p) => {
    const key = p.url.replace(/\/$/, '')
    if (seenUrl.has(key)) return false
    seenUrl.add(key)
    return true
  })

  const ranked = unique
    .filter((p) => !input.alreadyLinking.has(p.id))
    .map((p) => ({ p, sim: cosine(targetVec, p.vec) }))
    .sort((a, b) => b.sim - a.sim)
    // Слишком близкие страницы — это не доноры, а кандидаты на каннибализацию:
    // ссылка с почти такой же страницы не помогает, а подсвечивает дубль.
    .filter((x) => x.sim < 0.9)
    .slice(0, Math.max(min + 3, 5))

  const donors: Donor[] = []
  for (const { p, sim } of ranked) {
    let text = p.text ?? ''
    if (input.fetchText) {
      const live = await input.fetchText(p.url).catch(() => null)
      if (live) text = live
    }
    const anchor = pickAnchor(input.anchorCandidates, text, topicStems(input))
    const point = anchor ? findInsertionPoint(text, anchor) : null
    donors.push({
      pageId: p.id, url: p.url, title: p.title, similarity: Number(sim.toFixed(3)),
      anchor: anchor ?? input.targetH1,
      insertionPoint: point,
      status: point ? 'proposed' : 'manual_required',
      reason: point
        ? `в тексте есть фраза «${anchor}» — ссылка встаёт по смыслу, без подпорки`
        : 'подходящей фразы в тексте нет: вставка требует правки предложения человеком',
    })
  }
  return donors
}

/**
 * Анкор описывает целевую страницу (§8.3) и уже встречается в тексте донора.
 *
 * Дословный поиск не работал: в кандидаты подставляется заголовок статьи целиком
 * («Поступление на магистратуру в Австрии: программы, языки, деньги»), а такой фразы
 * на страницах сайта нет и быть не может. Поэтому кандидат разбирается на осмысленные
 * куски, и они ищутся с учётом русских окончаний.
 */
function pickAnchor(candidates: string[], donorText: string, mustContain: string[]): string | null {
  const low = donorText.toLowerCase()
  for (const phrase of anchorVariants(candidates)) {
    const found = findPhrase(low, phrase)
    if (found && isUsableAnchor(found, mustContain)) return found
  }
  return null
}

// Служебные слова: анкор, начинающийся или кончающийся на них, — обрубок вроде
// «обучения за» или «магистратура в». По §8.3 такой анкор не описывает цель.
const STOPWORDS = new Set(['в', 'во', 'на', 'за', 'для', 'с', 'со', 'по', 'из', 'от', 'до', 'к', 'о', 'об',
  'при', 'над', 'под', 'и', 'а', 'но', 'или', 'что', 'как', 'это', 'все', 'ещё', 'еще'])

/** Анкор годится, если он осмыслен сам по себе и говорит о теме целевой страницы. */
function isUsableAnchor(anchor: string, mustContain: string[]): boolean {
  const words = anchor.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return false
  // Одно слово годится, если оно само называет предмет: «магистратуре», «стипендии».
  // §8.3 запрещает «здесь» и «подробнее», а не тематическое существительное.
  if (words.length === 1 && (words[0].length < 8 || STOPWORDS.has(words[0]))) return false
  if (STOPWORDS.has(words[0]) || STOPWORDS.has(words[words.length - 1])) return false
  // Хотя бы одно слово должно быть о теме цели, иначе ссылка стоит непонятно почему
  const low = anchor.toLowerCase()
  return mustContain.length === 0 || mustContain.some((stem) => low.includes(stem))
}

/** Основы значимых слов темы: анкор обязан содержать хотя бы одну из них. */
function topicStems(input: LinkPlanInput): string[] {
  return `${input.targetTitle} ${input.targetH1}`
    .toLowerCase()
    .split(/[^\p{L}\d]+/u)
    .filter((w) => w.length >= 6 && !STOPWORDS.has(w))
    .map((w) => w.slice(0, 6))
    .filter((w, i, a) => a.indexOf(w) === i)
    .slice(0, 6)
}

/** Из заголовков и ключей делаем список фраз: от точных к более общим. */
function anchorVariants(candidates: string[]): string[] {
  const out: string[] = []
  const push = (v: string) => {
    const t = v.trim().replace(/^[«"']|[»"'.,:;]$/g, '').trim()
    if (t && !out.includes(t)) out.push(t)
  }
  for (const c of candidates) {
    if (!c) continue
    push(c)
    // Заголовок вида «Тема: подробности» — берём часть до двоеточия
    const beforeColon = c.split(/[:—–]/)[0]
    if (beforeColon !== c) push(beforeColon)
    // И скользящее окно по словам: 4, затем 3, затем 2 слова подряд
    const words = c.split(/\s+/).filter(Boolean)
    // Двусловные окна нужны: «англоязычные программы», «университеты Австрии».
    // От обрубков вроде «обучения за» защищают не они, а проверки в isUsableAnchor.
    for (const size of [5, 4, 3, 2, 1]) {
      for (let i = 0; i + size <= words.length; i++) push(words.slice(i, i + size).join(' '))
    }
  }
  // Длинные фразы точнее описывают цель — пробуем их первыми
  return out.sort((a, b) => b.length - a.length)
}

/**
 * Поиск фразы с учётом русской морфологии: «магистратуру в Австрии» должно найтись
 * по «магистратура в Австрии». Точной морфологии тут не нужно — достаточно сравнивать
 * слова по основам, отбрасывая хвост в пару букв.
 */
function findPhrase(text: string, phrase: string): string | null {
  const words = phrase.toLowerCase().split(/\s+/).filter(Boolean)
  const pattern = words
    .map((w) => {
      const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Слова короче пяти букв (предлоги, «в», «на») ищем целиком, остальные — по основе
      if (w.length < 5) return esc
      const stem = esc.slice(0, Math.max(4, esc.length - 2))
      return `${stem}[а-яё]{0,3}`
    })
    .join('\\s+')
  const re = new RegExp(pattern, 'i')
  const m = text.match(re)
  return m ? m[0] : null
}

/** Предложение, в котором стоит фраза, — его и покажем человеку в карточке правки. */
function findInsertionPoint(text: string, anchor: string): string | null {
  const idx = text.toLowerCase().indexOf(anchor.toLowerCase())
  if (idx < 0) return null
  const start = Math.max(0, text.lastIndexOf('.', idx) + 1)
  const endDot = text.indexOf('.', idx)
  const end = endDot < 0 ? Math.min(text.length, idx + 200) : endDot + 1
  return text.slice(start, end).trim()
}

/** Сохранить план в seo.link_suggestions. Цель может быть ещё не опубликована. */
export async function saveLinkPlan(
  seo: any, donors: Donor[], target: { topicId: number | null; pageId: number | null },
): Promise<{ inserted: number }> {
  if (!donors.length) return { inserted: 0 }
  const rows = donors.map((d) => ({
    from_page_id: d.pageId,
    to_page_id: target.pageId,
    to_topic_id: target.pageId ? null : target.topicId,
    anchor: d.anchor,
    reason: d.reason,
    score: d.similarity,
    status: target.pageId ? d.status : 'waiting_target',
  }))
  const { error } = await seo.from('link_suggestions').insert(rows)
  if (error) throw new Error(`link_suggestions: ${error.message}`)
  return { inserted: rows.length }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}
