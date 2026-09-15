/**
 * Разбор русского сообщения о деньгах.
 *
 * Это первый слой, и он нарочно тупой: правила, а не модель. Причина в том, что
 * у правил предсказуемый отказ. Когда правило не сработало, оно так и говорит —
 * «не понял сумму», — и человек уточняет. Модель в том же месте уверенно
 * придумает число, и это будет незаметная ошибка в деньгах.
 *
 * Поэтому здесь: сумма, валюта, тип операции, дата, подсказки по категории и
 * контрагенту — и честный список того, что осталось неясным. Модель добавится
 * поверх как второй заход для сообщений, которые правила не разобрали; решение
 * всё равно останется за сервером и за человеком.
 *
 * Ничего не выдумывается. Если в сообщении нет контрагента, поле остаётся
 * пустым, а не заполняется похожим именем из справочника.
 */
import type { TxKind } from './kinds'
import type { Currency } from './money'

export type Provenance = 'explicit' | 'rule' | 'unresolved'

export type Candidate = {
  kind: TxKind
  kindFrom: Provenance
  amountMinor: number | null
  currency: Currency | null
  currencyFrom: Provenance
  occurredAt: string
  dateFrom: Provenance
  categoryHint: string | null
  counterpartyHint: string | null
  note: string
  /** Что осталось неясным: пока список не пуст, операция не проводится. */
  unresolved: string[]
  /** Человеческий вопрос, который нужно задать. Пусто — вопросов нет. */
  question: string | null
}

export type ParseContext = {
  /** Названия категорий из справочника: выбираем только из них. */
  categories: string[]
  /** Псевдонимы контрагентов: «оля» → «Ольга Петрова». */
  aliases: Record<string, string>
  /** Часовой пояс компании — для «сегодня» и «вчера». */
  timeZone?: string
  now?: Date
}

/* ── Слова, по которым узнаём тип операции ────────────────────────────────── */

/**
 * Границы слова для кириллицы.
 *
 * `\b` в JavaScript считает словом только латиницу и цифры, поэтому
 * `\bпришло\b` не совпадает никогда — проверено тестом, где из-за этого молча
 * не срабатывали почти все правила. Собираем границы сами через отрицание
 * буквы с флагом `u`.
 */
function word(...variants: string[]): RegExp {
  return new RegExp(`(^|[^\\p{L}])(${variants.join('|')})(?![\\p{L}])`, 'iu')
}

const KIND_RULES: { kind: TxKind; words: RegExp }[] = [
  { kind: 'transfer', words: word('перев(ёл|ел|ели|од|ода)') },
  { kind: 'fee', words: word('комисси(я|ю|и|ей)') },
  { kind: 'refund_out', words: word('верн(ул|ули)\\s+(клиент\\p{L}*|ему|ей)', 'возврат\\s+клиент\\p{L}*') },
  { kind: 'refund_in', words: word('верн(ули|ул)\\s+(нам|мне|деньги|за)', 'возврат\\s+(нам|за)') },
  { kind: 'founder_contribution', words: word('вн(ёс|ес|если)\\s+(свои|своих|своими)', 'пополнил\\s+из\\s+личн\\p{L}*') },
  { kind: 'founder_withdrawal', words: word('забрал\\s+себе', 'вывел\\s+себе', 'снял\\s+себе') },
  { kind: 'income', words: word(
      'доход(ы|а)?', 'выручк(а|и|у)', 'пришл(о|а|и)', 'поступил(о|а|и)?', 'поступлени(е|я)', 'приход',
      'зачислил(и|а)?', 'получил(и|а)?\\s+(от|на\\s+счёт|деньги)', 'оплат(а|ы|у)\\s+клиент\\p{L}*',
      'заплатил(и|а)?\\s+(нам|клиент\\p{L}*)', 'перевели\\s+нам') },
  { kind: 'expense', words: word(
      'расход(ы)?', 'оплатил(а|и)?', 'потратил(а|и)?', 'купил(а|и)?', 'заплатил(а|и)?',
      'зарплат(а|ы|у|е)', 'выплатил(а|и)?', 'списал(и|а)?', 'затрат(а|ы)') },
]

/* ── Числа ────────────────────────────────────────────────────────────────── */

const MULTIPLIERS: { re: RegExp; factor: number }[] = [
  { re: /^(млн|миллион(а|ов)?)$/i, factor: 1_000_000 },
  { re: /^(к|k|тыс|тыс\.|тысяч(а|и|ей)?)$/i, factor: 1_000 },
]

const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма[йя]', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр']

type Amount = { minor: number; explicitUnit: boolean; currency: Currency | null; raw: string }

/**
 * Найти сумму. Возвращает и то, была ли единица названа явно: «15» и «15 тысяч»
 * различаются, и во втором случае уточнять нечего.
 */
function findAmount(text: string): Amount | null {
  // Число, возможно с пробелами внутри и дробной частью, затем необязательная
  // единица и валюта.
  const re = /(\d[\d\s ]*(?:[.,]\d{1,2})?)\s*([a-zA-Zа-яёА-ЯЁ.]+)?/g
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    const digits = m[1].replace(/[\s ]/g, '').replace(',', '.')
    const value = Number(digits)
    if (!Number.isFinite(value) || value <= 0) continue

    const word = (m[2] ?? '').replace(/\.$/, '')
    const mult = MULTIPLIERS.find((x) => x.re.test(word))
    const currency = currencyOf(word) ?? currencyOf(text.slice(m.index, m.index + m[0].length + 6))

    // Дата «12 сентября» — не сумма. Отсекаем по соседнему слову-месяцу.
    if (MONTHS.some((mon) => new RegExp(`^${mon}`, 'i').test(word))) continue

    const factor = mult?.factor ?? 1
    const minor = Math.round(value * factor * 100)
    return {
      minor,
      explicitUnit: !!mult || !!currency,
      currency,
      raw: m[0].trim(),
    }
  }
  return null
}

function currencyOf(word: string): Currency | null {
  if (/\$|usd|долл|бакс/i.test(word)) return 'USD'
  if (/₽|руб|rub|\bр\b/i.test(word)) return 'RUB'
  return null
}

/* ── Дата ─────────────────────────────────────────────────────────────────── */

function findDate(text: string, now: Date): { at: Date; from: Provenance } {
  if (word('позавчера').test(text)) return { at: shiftDays(now, -2), from: 'explicit' }
  if (word('вчера').test(text)) return { at: shiftDays(now, -1), from: 'explicit' }
  if (word('сегодня').test(text)) return { at: now, from: 'explicit' }

  const m = text.match(new RegExp(`(\\d{1,2})\\s+(${MONTHS.join('|')})\\w*`, 'i'))
  if (m) {
    const day = Number(m[1])
    const month = MONTHS.findIndex((mon) => new RegExp(`^${mon}`, 'i').test(m[2]))
    if (day >= 1 && day <= 31 && month >= 0) {
      const at = new Date(now)
      at.setMonth(month, day)
      at.setHours(12, 0, 0, 0)
      // Названный месяц в будущем — это прошлый год, а не завтрашний день.
      if (at.getTime() > now.getTime() + 86400_000) at.setFullYear(at.getFullYear() - 1)
      return { at, from: 'explicit' }
    }
  }
  return { at: now, from: 'rule' }
}

function shiftDays(d: Date, days: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + days)
  return out
}

/* ── Разбор ───────────────────────────────────────────────────────────────── */

/**
 * Одно сообщение может содержать несколько операций. Режем по переводам строк и
 * точкам с запятой — это единственные разделители, в которых можно быть
 * уверенным. «Ольге зарплата 30 тысяч, реклама 15» через запятую разбирается
 * как одна операция с уточнением, а не угадывается: цена ошибки выше цены
 * лишнего вопроса.
 */
export function parseMessage(text: string, ctx: ParseContext): Candidate[] {
  const parts = text
    .split(/[\n;]+/)
    .map((p) => p.trim())
    .filter((p) => p && /\d/.test(p))

  if (!parts.length) return []
  return parts.map((p) => parseOne(p, ctx))
}

export function parseOne(text: string, ctx: ParseContext): Candidate {
  const now = ctx.now ?? new Date()
  const lower = text.toLowerCase()

  const kindRule = KIND_RULES.find((r) => r.words.test(lower))
  // Группа заведена для фактов: сумма без глагола — это расход, а не обсуждение
  // (PRD §7.1). Но тип, взятый правилом, помечается как правило, не как явный.
  const kind: TxKind = kindRule?.kind ?? 'expense'

  const amount = findAmount(text)
  const date = findDate(lower, now)

  const unresolved: string[] = []
  let question: string | null = null

  if (!amount) {
    unresolved.push('amount')
    question = 'Не понял сумму. Напишите числом, например «6000».'
  }

  // «Реклама 15» — это 15 рублей или 15 тысяч? Пока не сказано, не проводим
  // (PRD §17.29). Порог — сто рублей: ниже него прочтение «тысячами» реально
  // правдоподобно, а «комиссия 500» спрашивать незачем — пятьсот тысяч комиссии
  // не бывает, и лишний вопрос здесь раздражает больше, чем помогает.
  if (amount && !amount.explicitUnit && amount.minor < 10_000) {
    unresolved.push('amount')
    question = `«${amount.raw}» — это ${fmt(amount.minor)} или ${fmt(amount.minor * 1000)}?`
  }

  const currency = amount?.currency ?? null
  const categoryHint = matchCategory(lower, ctx.categories)
  const counterpartyHint = matchAlias(lower, ctx.aliases)

  return {
    kind,
    kindFrom: kindRule ? 'explicit' : 'rule',
    amountMinor: amount?.minor ?? null,
    currency,
    currencyFrom: currency ? 'explicit' : 'rule',
    occurredAt: date.at.toISOString(),
    dateFrom: date.from,
    categoryHint,
    counterpartyHint,
    note: text.trim().slice(0, 300),
    unresolved,
    question,
  }
}

function fmt(minor: number): string {
  return `${Math.round(minor / 100).toLocaleString('ru-RU')} ₽`
}

/**
 * Основа слова: отрезаем русские окончания, чтобы «Ольге», «Оле» и «Ольга»
 * сходились, а «оплата» находилась по категории «Оплаты клиентов».
 *
 * Это не морфология, а грубое правило — и этого достаточно: контрагенты берутся
 * из белого списка псевдонимов, а при нескольких совпадениях мы не выбираем, а
 * спрашиваем.
 */
function stem(w: string): string {
  return w.toLowerCase()
    .replace(/(ами|ями|ов|ев|ой|ей|ом|ем|ах|ях|ую|юю|ые|ий|ый|ая|яя|а|я|ы|и|о|е|у|ю|ь)$/u, '')
}

/**
 * Категория ищется по основе слова, а не по точному совпадению: «профориентолог»
 * должен попасть в «Профориентация». Выбор только из существующих категорий —
 * новых не заводим.
 */
function matchCategory(lower: string, categories: string[]): string | null {
  const words = lower.split(/[^\p{L}]+/u).filter((w) => w.length >= 4).map(stem)
  for (const name of categories) {
    const catStems = name.toLowerCase().split(/[\s,]+/).map(stem).filter((x) => x.length >= 4)
    for (const cs of catStems) {
      if (words.some((w) => w.startsWith(cs) || cs.startsWith(w.slice(0, 5)) && w.length >= 5)) return name
    }
  }
  return null
}

/**
 * Контрагент — только из справочника псевдонимов. Похожих имён не придумываем, а
 * если под основу подошли двое разных, не выбираем сами: пусть спросит бот.
 */
function matchAlias(lower: string, aliases: Record<string, string>): string | null {
  const words = lower.split(/[^\p{L}]+/u).filter((w) => w.length >= 3)
  const hits = new Set<string>()

  for (const w of words) {
    const ws = stem(w)
    if (ws.length < 2) continue
    for (const [alias, name] of Object.entries(aliases)) {
      const as = stem(alias)
      if (as.length < 2) continue
      if (ws === as || ws.startsWith(as) || as.startsWith(ws)) hits.add(name)
    }
  }
  return hits.size === 1 ? [...hits][0] : null
}
