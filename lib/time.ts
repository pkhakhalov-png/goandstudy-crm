/**
 * Все даты/часы в CRM — по Москве (UTC+3, без DST).
 * Сервер на Vercel работает в UTC, клиенты могут быть в любом TZ. Поэтому строим
 * YYYY-MM-DD и HH:MM явно через Intl с timeZone='Europe/Moscow'.
 *
 * Не используй new Date().toISOString().split('T')[0] и .getHours() — они дадут UTC
 * (на сервере) или локальное время браузера (на клиенте), что ломает сравнение
 * с DATE/TIME полями bookings, заполняемыми пользователями из РФ.
 */

const MSK_TZ = 'Europe/Moscow'

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: MSK_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: MSK_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** Сегодняшняя дата в МСК — формат YYYY-MM-DD. */
export function mskTodayStr(now: Date = new Date()): string {
  // en-CA выдаёт YYYY-MM-DD напрямую
  return dateFmt.format(now)
}

/** Текущее время в МСК — формат HH:MM. */
export function mskTimeStr(now: Date = new Date()): string {
  return timeFmt.format(now)
}

/** Формат даты по МСК YYYY-MM-DD от произвольного Date. */
export function mskDateStr(d: Date): string {
  return dateFmt.format(d)
}

/** Сдвиг даты МСК на N дней — возвращает YYYY-MM-DD. */
export function mskAddDays(days: number, base: Date = new Date()): string {
  const ms = base.getTime() + days * 86400_000
  return dateFmt.format(new Date(ms))
}

/** Возвращает день недели (Mon=0..Sun=6) для даты, интерпретированной по МСК. */
export function mskDayOfWeek(dateStr: string): number {
  // dateStr = YYYY-MM-DD; используем 12:00 МСК = 09:00 UTC, чтобы всегда попасть в нужные сутки
  const d = new Date(`${dateStr}T09:00:00.000Z`)
  // d.getUTCDay() даёт 0=Sun..6=Sat; конвертим в 0=Mon..6=Sun
  return (d.getUTCDay() + 6) % 7
}
