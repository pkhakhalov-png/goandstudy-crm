// Форматтеры модуля аналитики (по разделу «Форматирование» хендоффа).
// Везде табличные цифры; запятая — десятичный разделитель.

const nbsp = ' '

// Полная сумма: «1 250 000 ₽» (пробел-разделитель, ₽ после неразрывного пробела).
export function money(v: number): string {
  return `${Math.round(v).toLocaleString('ru-RU')}${nbsp}₽`
}

// Компактно для осей/центров донатов: «4,2 млн ₽», «740 тыс ₽».
export function short(v: number): string {
  const a = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  if (a >= 1_000_000) return `${sign}${fmt1(a / 1_000_000)}${nbsp}млн${nbsp}₽`
  if (a >= 1_000) return `${sign}${Math.round(a / 1_000)}${nbsp}тыс${nbsp}₽`
  return `${sign}${Math.round(a)}${nbsp}₽`
}

// Одна десятая с запятой, без лишнего ,0.
function fmt1(n: number): string {
  const r = Math.round(n * 10) / 10
  return (Number.isInteger(r) ? r.toString() : r.toFixed(1)).replace('.', ',')
}

// Проценты: целые (KPI/таблицы) или с десятой (легенды донатов).
export function pct(v: number, decimals = 0): string {
  return decimals === 0 ? `${Math.round(v)}%` : `${fmt1(v)}%`
}

// Дни: «6,5 дн.», «47 дн.»; «в срок» вместо 0.
export function days(v: number): string {
  if (!v || v <= 0) return 'в срок'
  return `${fmt1(v)}${nbsp}дн.`
}

// Ярлык месяца из 'YYYY-MM' → «Авг».
const MONTHS_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']
const MONTHS_FULL = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
export function monthShort(ym: string): string {
  const m = Number(ym.split('-')[1])
  return MONTHS_SHORT[m - 1] ?? ym
}
export function monthFull(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS_FULL[m - 1]} ${y}`
}
