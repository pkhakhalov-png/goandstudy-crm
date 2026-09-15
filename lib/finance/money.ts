/**
 * Деньги: хранение, разбор, показ.
 *
 * Всё внутри системы — целые минорные единицы: копейки и центы. Причина простая
 * и проверяемая: 0.1 + 0.2 в двоичной дроби не равно 0.3. На одной операции это
 * незаметно, а на сверке с банком вылезает расхождением в копейку, которое
 * невозможно объяснить и неоткуда исправить. Поэтому дробных рублей в коде нет
 * вообще: они появляются только в момент показа человеку.
 */

export type Currency = 'RUB' | 'USD'

export const CURRENCIES: Currency[] = ['RUB', 'USD']

const SIGNS: Record<Currency, string> = { RUB: '₽', USD: '$' }

/** Сколько минорных единиц в одной основной. Для рубля и доллара одинаково. */
const MINOR = 100

/**
 * Разбор суммы, введённой человеком.
 *
 * Принимает «6000», «6 000», «6000,50», «6 000.50», «6000₽». Не принимает
 * отрицательные и пустые: знак задаётся типом операции, а не минусом в поле,
 * иначе «расход −6000» и «расход 6000» означали бы разное в одном поле.
 *
 * Возвращает null, если разобрать не удалось. Молча подставлять ноль нельзя:
 * ноль — это «денег не двигалось», а не «я не понял, что вы написали».
 */
export function parseAmountToMinor(raw: string): number | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw
    .replace(/[\s  ]/g, '')
    .replace(/[₽$рруб.]*$/i, '')
    .replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value) || value <= 0) return null
  // Округление через строку, а не через умножение: 19.99 * 100 в double даёт
  // 1998.9999999999998, и Math.round спасает не всегда.
  const [whole, frac = ''] = cleaned.split('.')
  return Number(whole) * MINOR + Number(frac.padEnd(2, '0'))
}

/** Показ суммы человеку: «246 160 ₽», «1 000,50 $». */
export function formatMinor(minor: number, currency: Currency, opts: { sign?: boolean } = {}): string {
  const negative = minor < 0
  const abs = Math.abs(minor)
  const whole = Math.trunc(abs / MINOR)
  const frac = abs % MINOR

  const wholeText = whole.toLocaleString('ru-RU').replace(/ /g, ' ')
  const text = frac === 0 ? wholeText : `${wholeText},${String(frac).padStart(2, '0')}`

  const prefix = negative ? '−' : opts.sign ? '+' : ''
  return `${prefix}${text} ${SIGNS[currency]}`
}

/** Короткая запись без валюты — для таблиц, где валюта в заголовке колонки. */
export function formatMinorPlain(minor: number): string {
  const abs = Math.abs(minor)
  const whole = Math.trunc(abs / MINOR)
  const frac = abs % MINOR
  const wholeText = whole.toLocaleString('ru-RU').replace(/ /g, ' ')
  const body = frac === 0 ? wholeText : `${wholeText},${String(frac).padStart(2, '0')}`
  return minor < 0 ? `−${body}` : body
}

/**
 * Рублёвый эквивалент суммы в долларах.
 *
 * Возвращает null, когда курса нет. Это не то же самое, что ноль: без курса
 * доллары всё равно учитываются, а рублёвый итог помечается неполным. Считать
 * неизвестный курс нулём — значит показать, что денег меньше, чем есть.
 */
export function toRubEquivalent(minor: number, currency: Currency, rubPerUsd: number | null): number | null {
  if (currency === 'RUB') return minor
  if (!rubPerUsd || rubPerUsd <= 0) return null
  return Math.round(minor * rubPerUsd)
}

export function currencySign(currency: Currency): string {
  return SIGNS[currency]
}
