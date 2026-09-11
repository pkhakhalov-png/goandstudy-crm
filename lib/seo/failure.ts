/**
 * Временная беда или окончательная.
 *
 * Разница практическая: временную нужно повторить через несколько минут —
 * очередь умеет это сама, с растущей паузой. Окончательную повторять
 * бессмысленно, она только жжёт попытки и деньги.
 *
 * Ошибались мы в обе стороны: перегрузка модели роняла статью насовсем,
 * а нехватка денег на счёте уходила в бесконечные повторы.
 */
const TEMPORARY = [
  /\b(429|500|502|503|504)\b/,
  /rate.?limit|too many requests|overloaded|server_error|service unavailable/i,
  /timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|fetch failed|socket hang up/i,
  /temporarily|try again/i,
]

const PERMANENT = [
  /\b(400|401|403|404|422)\b/,
  /no credits|insufficient|quota|billing|invalid.?api.?key|unauthorized|invalid_client/i,
  /слаг .* уже занят|нечего обновлять|недопустим/i,
]

export function isTemporary(err: unknown): boolean {
  const text = String((err as any)?.message ?? err ?? '')
  if (PERMANENT.some((re) => re.test(text))) return false
  return TEMPORARY.some((re) => re.test(text))
}

/** Исход шага по ошибке: повторить или признать поражение. */
export function outcomeFor(err: unknown): { outcome: 'retry' | 'failed'; result: Record<string, any> } {
  const message = String((err as any)?.message ?? err ?? '').slice(0, 300)
  return isTemporary(err)
    ? { outcome: 'retry', result: { error: message, temporary: true } }
    : { outcome: 'failed', result: { error: message } }
}
