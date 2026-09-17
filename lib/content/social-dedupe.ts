/**
 * Два варианта или один пост дважды (E4.7).
 *
 * Требование PRD, которое легче всего потерять: адаптация меняет угол и глубину,
 * а не синонимы. Пересказ статьи теми же словами — это дубль, а не вариант. На
 * такое нужна проверка, а не обещание в инструкции: обещание модель забудет на
 * третьем посте, а проверка — нет.
 *
 * Здесь две разные проверки, и путать их нельзя.
 *
 * 1. Совпадение вариантов одного пакета. Телеграм и ВК получают один материал;
 *    если больше половины предложений совпало, это не два варианта, а один,
 *    разосланный дважды. Считаем по предложениям, потому что именно предложение
 *    — единица пересказа: переставленные слова внутри фразы ничего не меняют.
 *
 * 2. Повтор тезиса во времени. Третий раз за месяц выпустить одну и ту же мысль
 *    другими словами — не дубль по буквам и не ловится сравнением предложений.
 *    Здесь работает отпечаток содержания: набор смысловых основ слов. Синонимы
 *    его частично меняют, но тема, предмет и действие остаются, и похожесть
 *    видно числом.
 *
 * Обе проверки — чистые функции: ни базы, ни сети. Их можно прогнать в тесте, и
 * это осознанно, потому что проверку, которую нельзя прогнать, не прогоняют.
 */
import { createHash } from 'node:crypto'

/* ── Разбор текста ────────────────────────────────────────────────────────── */

/** Служебные слова: они есть в любом тексте и о содержании не говорят ничего. */
const STOP = new Set([
  'и', 'а', 'но', 'или', 'что', 'как', 'это', 'этот', 'эта', 'эти', 'тот', 'та', 'те',
  'в', 'во', 'на', 'за', 'по', 'из', 'от', 'до', 'для', 'при', 'про', 'над', 'под', 'без',
  'с', 'со', 'к', 'ко', 'у', 'о', 'об', 'обо', 'же', 'ли', 'бы', 'не', 'ни', 'да', 'нет',
  'он', 'она', 'оно', 'они', 'мы', 'вы', 'ты', 'я', 'вам', 'нам', 'вас', 'нас', 'его', 'её',
  'их', 'свой', 'своя', 'свои', 'там', 'тут', 'здесь', 'там', 'уже', 'ещё', 'еще', 'только',
  'если', 'чтобы', 'когда', 'потому', 'так', 'такой', 'также', 'тоже', 'очень', 'более',
  'быть', 'есть', 'был', 'была', 'было', 'были', 'будет', 'будут', 'может', 'можно', 'нужно',
])

/**
 * Смысловая основа слова.
 *
 * Обрезаем до пяти букв — грубо, но работает на русском: «поступление»,
 * «поступить», «поступлению» дают одну основу. Настоящая лемматизация дала бы
 * чуть лучше и потребовала бы словаря на десятки мегабайт; для «то же самое
 * другими словами» разницы нет.
 */
function stem(word: string): string {
  return word.slice(0, 5)
}

/** Смысловые основы текста: без служебных слов, без чисел, без повторов. */
export function stems(text: string): string[] {
  const words = text.toLowerCase().replace(/ё/g, 'е').split(/[^\p{L}\d]+/u)
  const out: string[] = []
  const seen = new Set<string>()
  for (const w of words) {
    if (w.length < 4 || STOP.has(w)) continue
    if (/^\d+$/.test(w)) continue
    const s = stem(w)
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

/** Предложения текста в сравнимом виде: без знаков, без лишних пробелов. */
export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\d\s]/gu, '').replace(/\s+/g, ' ').trim())
    .filter((s) => s.split(' ').length >= 3)   // «Смотрите ниже» совпадает у всех и ни о чём не говорит
}

/** Доля общего у двух наборов. 1 — одно и то же, 0 — ничего общего. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let common = 0
  for (const x of a) if (b.has(x)) common++
  return common / (a.size + b.size - common)
}

/**
 * Насколько меньший набор укладывается в больший.
 *
 * Жаккар для этого не годится: он наказывает за разницу в длине. Короткий пост,
 * целиком повторяющий мысль длинного, получал у него 0.22 — и повтор проходил
 * незамеченным, хотя это ровно тот случай, ради которого проверка и нужна.
 *
 * У совсем коротких текстов вложенность врёт в другую сторону: фраза из шести
 * основ найдётся внутри чего угодно по той же теме. Поэтому ниже восьми основ
 * возвращаемся к Жаккару.
 */
function containment(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  const smaller = Math.min(a.size, b.size)
  if (smaller < 8) return jaccard(a, b)
  let common = 0
  for (const x of a) if (b.has(x)) common++
  return common / smaller
}

/* ── 1. Два варианта одного пакета ────────────────────────────────────────── */

export type OverlapReport = {
  /** Доля совпавших предложений от более короткого текста. */
  overlap: number
  /** Сколько предложений совпало и сколько их всего. */
  matched: number
  total: number
  /** Сами совпавшие предложения — чтобы человек увидел пересказ, а не поверил числу. */
  examples: string[]
}

/**
 * Порог, при котором две фразы считаются одной.
 *
 * Не на глаз: замерено на живой паре текстов. Пересказ того же материала
 * синонимами даёт по фразам 0.40, 0.44, 0.43 и 1.00; тот же материал под другим
 * углом — 0.15, 0.10, 0.08 и 0.00. Между 0.15 и 0.40 лежит пустое место, в него
 * и поставлен порог. Восемь десятых, стоявшие здесь сначала, ловили только
 * дословный повтор и пропускали замену слов — то есть ровно то, что PRD и
 * называет не адаптацией.
 */
const SENTENCE_MATCH = 0.35

/**
 * Насколько один вариант пересказывает другой.
 *
 * Предложения считаем совпавшими не только при дословном равенстве: перестановка
 * слов и замена пары синонимов — это и есть пересказ, ради ловли которого всё
 * затевалось.
 *
 * Доля берётся от более короткого текста: короткий пост, целиком вложенный в
 * длинный, — это дубль, даже если у длинного есть ещё десять своих абзацев.
 */
export function variantOverlap(a: string, b: string): OverlapReport {
  const sa = sentences(a)
  const sb = sentences(b)
  if (!sa.length || !sb.length) return { overlap: 0, matched: 0, total: 0, examples: [] }

  const setsB = sb.map((s) => new Set(stems(s)))
  const examples: string[] = []
  let matched = 0

  for (const s of sa) {
    const setA = new Set(stems(s))
    const hit = sb.some((other, i) => other === s || jaccard(setA, setsB[i]) >= SENTENCE_MATCH)
    if (hit) {
      matched++
      if (examples.length < 5) examples.push(s)
    }
  }

  const total = Math.min(sa.length, sb.length)
  return { overlap: total ? matched / total : 0, matched, total, examples }
}

export type DistinctVerdict = {
  ok: boolean
  overlap: number
  why: string
  examples: string[]
}

/**
 * Два ли это варианта.
 *
 * Порог половины взят из PRD дословно: «два варианта одного пакета, у которых
 * совпадает больше половины предложений, — не два варианта». Порог — параметр,
 * но менять его по месту нельзя: это решение редакции, а не подгонка под текст,
 * который не проходит.
 */
export function variantsAreDistinct(a: string, b: string, maxOverlap = 0.5): DistinctVerdict {
  const r = variantOverlap(a, b)
  const percent = Math.round(r.overlap * 100)

  // Второй признак, на случай если фразы пересобрали заново. Совпадение по
  // содержанию выше трёх четвертей при несовпадающих фразах — это тот же
  // материал, пересказанный целиком: у разных углов на живых текстах выходит
  // 0.19, у пересказа — 0.71.
  const sameStuff = thesisSimilarity(a, b)
  if (r.overlap <= maxOverlap && sameStuff >= 0.75) {
    return {
      ok: false,
      overlap: r.overlap,
      why: `фразы разные, но содержание совпадает на ${Math.round(sameStuff * 100)}% — это пересказ целиком, а не другой угол. `
        + 'Вариант отвечает на другой вопрос читателя, а не переставляет те же мысли.',
      examples: r.examples,
    }
  }

  if (r.overlap > maxOverlap) {
    return {
      ok: false,
      overlap: r.overlap,
      why: `совпало ${percent}% предложений (${r.matched} из ${r.total}) — это один пост, выпущенный дважды, а не два варианта. `
        + 'Адаптация меняет угол и глубину: под какой вопрос читателя взят материал, что разобрано подробно, а что вынесено.',
      examples: r.examples,
    }
  }
  return {
    ok: true,
    overlap: r.overlap,
    why: `совпало ${percent}% предложений — варианты расходятся`,
    examples: r.examples,
  }
}

/* ── 2. Повтор тезиса во времени ──────────────────────────────────────────── */

export type Fingerprint = {
  /** Короткий отпечаток для сравнения «в лоб» и для колонки в базе. */
  hash: string
  /** Основы, по которым он посчитан: без них отпечаток нечем объяснить. */
  stems: string[]
}

/**
 * Отпечаток содержания.
 *
 * Берём смысловые основы, сортируем и хэшируем: от перестановки абзацев
 * отпечаток не меняется, а от смены темы меняется. Одинаковый хэш — тот же
 * материал наверняка; разный хэш ещё ничего не значит, поэтому рядом всегда
 * живёт похожесть числом.
 */
export function contentFingerprint(text: string): Fingerprint {
  const list = stems(text).sort()
  return { hash: createHash('sha1').update(list.join(' ')).digest('hex').slice(0, 16), stems: list }
}

/** Насколько два текста об одном и том же. 1 — одно и то же, 0 — разное. */
export function thesisSimilarity(a: string | Fingerprint, b: string | Fingerprint): number {
  const sa = typeof a === 'string' ? stems(a) : a.stems
  const sb = typeof b === 'string' ? stems(b) : b.stems
  return containment(new Set(sa), new Set(sb))
}

export type PastPost = {
  id: string | number
  /** Когда вышло. Нужно, чтобы отличить «повтор» от «возвращения к теме через полгода». */
  publishedAt: string | Date
  /** Текст или готовый отпечаток: пересчитывать отпечатки всей истории незачем. */
  text?: string
  fingerprint?: Fingerprint
  platform?: string
}

export type RepeatHit = {
  id: string | number
  similarity: number
  daysAgo: number
  platform?: string
  why: string
}

export type RepeatReport = {
  /** Нашлись ли повторы — то есть стоит ли вообще выпускать этот пост. */
  repeated: boolean
  hits: RepeatHit[]
  why: string
}

/**
 * Не выпускаем ли мы третий раз за месяц одну и ту же мысль.
 *
 * Это не проверка «текст уже публиковался»: буквальный дубль ловится хэшем и
 * встречается редко. Ловим другое — когда тему перефразировали и выпустили
 * снова, и ещё раз, и лента превращается в одно повторяющееся утверждение.
 *
 * Порог похожести означает «столько смысловых основ у постов общие».
 * Окно по умолчанию — 30 дней: вернуться к теме через полгода нормально, три
 * раза за месяц — нет.
 */
export function findRepeats(
  text: string,
  history: PastPost[],
  opts: { days?: number; threshold?: number; now?: Date; limit?: number } = {},
): RepeatReport {
  const days = opts.days ?? 30
  // Замерено: два поста с тем же тезисом другими словами дают 0.50 и 0.83,
  // пост на чужую тему — 0.00. Порог поставлен в пустое место между ними
  const threshold = opts.threshold ?? 0.45
  const now = opts.now ?? new Date()
  const limit = opts.limit ?? 2

  const fp = contentFingerprint(text)
  const hits: RepeatHit[] = []

  for (const past of history) {
    const when = past.publishedAt instanceof Date ? past.publishedAt : new Date(past.publishedAt)
    const daysAgo = Math.floor((now.getTime() - when.getTime()) / 864e5)
    if (daysAgo < 0 || daysAgo > days) continue

    const other = past.fingerprint ?? (past.text ? contentFingerprint(past.text) : null)
    if (!other) continue

    const similarity = other.hash === fp.hash ? 1 : thesisSimilarity(fp, other)
    if (similarity < threshold) continue

    hits.push({
      id: past.id,
      similarity,
      daysAgo,
      platform: past.platform,
      why: other.hash === fp.hash
        ? 'тот же материал: отпечаток содержания совпал полностью'
        : `тот же тезис другими словами: совпало ${Math.round(similarity * 100)}% смысловых основ`,
    })
  }

  hits.sort((a, b) => b.similarity - a.similarity)

  return {
    repeated: hits.length >= limit,
    hits,
    why: hits.length >= limit
      ? `за ${days} дней это уже ${hits.length + 1}-й пост с тем же тезисом — лента превращается в одно повторяющееся утверждение`
      : hits.length
        ? `похожий пост был ${hits[0].daysAgo} дн. назад (${Math.round(hits[0].similarity * 100)}%) — не повтор, но угол стоит сменить`
        : `за ${days} дней таких тезисов не выпускали`,
  }
}
