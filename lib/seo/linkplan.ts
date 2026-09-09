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
    const anchor = pickAnchor(input.anchorCandidates, text)
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

/** Анкор описывает целевую страницу (§8.3) и уже встречается в тексте донора. */
function pickAnchor(candidates: string[], donorText: string): string | null {
  const low = donorText.toLowerCase()
  const sorted = [...candidates].sort((a, b) => b.length - a.length)   // длиннее — точнее
  for (const c of sorted) {
    if (c.length < 12) continue                                        // «здесь»-подобные не берём
    if (low.includes(c.toLowerCase())) return c
  }
  return null
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
