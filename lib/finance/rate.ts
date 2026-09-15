/**
 * Справочный курс доллара.
 *
 * Зачем он вообще нужен — и чего он не делает. Для учёта курс не нужен:
 * долларовый расход уменьшает долларовый счёт, рублёвый — рублёвый, и суммы
 * никогда не смешиваются. Курс нужен ровно для одной строки «всего», где два
 * остатка сводятся в одно число для прикидки.
 *
 * Отсюда правило: изменение курса — не движение денег. На счетах от него ничего
 * не прибавляется и не убывает, и в отчёте о движении денег строки «заработали
 * на курсе» быть не может.
 *
 * Источник — ЦБ РФ. Ключей не требует, отдаёт официальный курс на дату. Если не
 * ответил, берём последний сохранённый: показать вчерашний курс с честной датой
 * лучше, чем не показать ничего или подставить выдуманное число.
 */

const CBR_URL = 'https://www.cbr-xml-daily.ru/daily_json.js'

export type Rate = { rub_per_usd: number; rate_date: string; source: 'manual' | 'cbr' | 'actual_transfer' }

/** Курс ЦБ на сегодня. Возвращает null, если источник недоступен. */
export async function fetchCbrRate(): Promise<{ rub_per_usd: number; rate_date: string } | null> {
  try {
    const res = await fetch(CBR_URL, { signal: AbortSignal.timeout(2500), cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json() as { Date?: string; Valute?: { USD?: { Value?: number } } }
    const value = data?.Valute?.USD?.Value
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
    return {
      rub_per_usd: Math.round(value * 1e4) / 1e4,
      rate_date: (data.Date ?? new Date().toISOString()).slice(0, 10),
    }
  } catch {
    return null
  }
}

/**
 * Курс на сегодня: берём сохранённый, а если его нет — спрашиваем ЦБ и
 * запоминаем. Ручной курс на ту же дату главнее: если владелец вписал своё
 * число, значит у него была причина, и перетирать её автоматикой нельзя.
 */
export async function ensureTodayRate(db: any): Promise<Rate | null> {
  const today = new Date().toISOString().slice(0, 10)

  const { data: stored } = await db.from('exchange_rates')
    .select('rub_per_usd, rate_date, source')
    .order('rate_date', { ascending: false })
    .order('source')
    .limit(10)

  const rows: Rate[] = (stored ?? []).map((r: any) => ({ ...r, rub_per_usd: Number(r.rub_per_usd) }))
  const manualToday = rows.find((r) => r.rate_date === today && r.source === 'manual')
  if (manualToday) return manualToday
  const anyToday = rows.find((r) => r.rate_date === today)
  if (anyToday) return anyToday

  const fresh = await fetchCbrRate()
  if (!fresh) return rows[0] ?? null

  const { error } = await db.from('exchange_rates').upsert(
    { rate_date: fresh.rate_date, rub_per_usd: fresh.rub_per_usd, source: 'cbr' },
    { onConflict: 'rate_date,source' },
  )
  // Ошибку записи не проглатываем. Она уже случалась: пока миграция с
  // источником «cbr» не применена, курс не сохранялся, а экран выглядел как
  // будто всё хорошо — и лез в ЦБ при каждом открытии.
  if (error) console.error('[finance] курс не сохранился:', error.message)

  return { ...fresh, source: 'cbr' }
}
