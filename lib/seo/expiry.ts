/**
 * Срок годности утверждения (E2.5).
 *
 * Годность — не одно число, а самое раннее из нескольких. Политика разрешает
 * верить проверке сколько-то дней; источник мог измениться раньше этого срока;
 * срок подачи проходит и утверждение про него становится мусором; набор
 * начинается и цена «для набора 2026» перестаёт быть ценой.
 *
 *   effective_expiry = min(политика, источник, срок подачи, набор)
 *
 * Считается каждый раз заново и нигде не хранится. Хранимое производное число
 * опаснее отсутствующего: оно выглядит как правда ровно до того момента, когда
 * перестаёт ею быть, и никто этого не замечает.
 *
 * Отдельно про непроверенное утверждение. У него нет срока годности — у него
 * нет и годности. Это не «истекло вчера», это «не начиналось», и в отчёте это
 * разные строки.
 */

export type Component = 'политика' | 'источник' | 'срок подачи' | 'набор' | 'проставлен вручную'

export type Expiry = {
  /** Когда годность кончается. null — ничто из известного её не ограничивает. */
  at: Date | null
  /** Что именно ограничило срок. */
  reason: Component | null
  /** Уже истекло на момент расчёта. */
  expired: boolean
  /** Проверки не было ни разу: годности нет, а не истекла. */
  neverVerified: boolean
  /** Все составляющие — чтобы было видно, почему вышло именно так. */
  parts: { name: Component; at: Date | null; note: string }[]
  /** Изменчивый тип: перед выпуском нужна короткая перепроверка. */
  volatile: boolean
}

/** Изменчивым считается тип, которому политика отвела не больше этого срока. */
export const VOLATILE_TTL_DAYS = 90

/** Насколько свежим должно быть подтверждение изменчивого типа на момент выпуска. */
export const RECHECK_WINDOW_DAYS = 7

/**
 * `180 days`, `6 mons`, `1 year` — в дни.
 *
 * Postgres отдаёт интервал строкой, и разбирать её приходится здесь. Не смогли
 * разобрать — возвращаем null, а не догадку: неверный срок годности хуже
 * отсутствующего, потому что по нему принимают решения.
 */
export function ttlDays(interval: string | null | undefined): number | null {
  if (!interval) return null
  let total = 0, matched = false
  const re = /(\d+)\s*(day|days|mon|mons|month|months|year|years|hour|hours)/gi
  for (const m of interval.matchAll(re)) {
    const n = Number(m[1]); const u = m[2].toLowerCase()
    matched = true
    if (u.startsWith('day')) total += n
    else if (u.startsWith('mon')) total += n * 30
    else if (u.startsWith('year')) total += n * 365
    else if (u.startsWith('hour')) total += n / 24
  }
  return matched ? total : null
}

const day = 86_400_000
const plusDays = (d: Date, n: number) => new Date(d.getTime() + n * day)

export type ClaimRow = {
  id: number
  kind: string
  status: string | null
  verified_at: string | null
  valid_to: string | null
  value_date: string | null
  intake_start: string | null
}

/**
 * Годность одного утверждения.
 *
 * `policyTtl` — строка интервала из `claim_policy.default_ttl`; `sourceChangedAt`
 * — момент, когда снимок источника впервые отличился уже после проверки. Оба
 * приходят снаружи, чтобы функция считалась без базы и проверялась тестом.
 */
export function computeExpiry(
  claim: ClaimRow,
  policyTtl: string | null,
  sourceChangedAt: Date | null,
  now = new Date(),
  sourceDatedAt: Date | null = null,
): Expiry {
  const parts: Expiry['parts'] = []
  const ttl = ttlDays(policyTtl)
  const volatile = ttl != null && ttl <= VOLATILE_TTL_DAYS

  const verified = claim.verified_at ? new Date(claim.verified_at) : null

  if (!verified) {
    parts.push({ name: 'политика', at: null, note: 'проверки не было ни разу' })
  } else if (ttl == null) {
    parts.push({ name: 'политика', at: null, note: 'срок в политике не задан или не разобран' })
  } else {
    parts.push({ name: 'политика', at: plusDays(verified, ttl), note: `${ttl} дн. от проверки` })
  }

  // Источник ограничивает годность двумя способами, и оба важнее срока политики.
  //
  // Первый: страница изменилась после того, как мы по ней проверяли, — годность
  // кончилась в этот момент.
  //
  // Второй, и он же тот, о котором легко забыть: источник может быть старше
  // нашей проверки. Подтвердить, что число есть на странице, и подтвердить, что
  // число действует, — разные утверждения. Если страница датирует себя сама,
  // срок считается от её даты. Иначе трёхлетняя таблица цен, прочитанная
  // сегодня, оказывается «годной ещё полгода».
  if (sourceChangedAt) {
    parts.push({ name: 'источник', at: sourceChangedAt, note: 'страница изменилась после проверки' })
  } else if (sourceDatedAt && ttl != null) {
    parts.push({
      name: 'источник',
      at: plusDays(sourceDatedAt, ttl),
      note: `источник датирует себя ${sourceDatedAt.toISOString().slice(0, 10)}, ${ttl} дн. от этой даты`,
    })
  } else {
    parts.push({ name: 'источник', at: null, note: 'изменений после проверки не замечено, своей даты источник не несёт' })
  }

  // Утверждение про срок подачи после этого срока — не устаревшее, а неверное.
  const deadline = claim.kind === 'deadline' && claim.value_date ? new Date(claim.value_date) : null
  parts.push(deadline
    ? { name: 'срок подачи', at: deadline, note: 'после этой даты утверждение о сроке бессмысленно' }
    : { name: 'срок подачи', at: null, note: 'утверждение не о сроке подачи' })

  const intake = claim.intake_start ? new Date(claim.intake_start) : null
  parts.push(intake
    ? { name: 'набор', at: intake, note: 'с началом набора условия прошлого набора не действуют' }
    : { name: 'набор', at: null, note: 'к конкретному набору не привязано' })

  const manual = claim.valid_to ? new Date(claim.valid_to) : null
  if (manual) parts.push({ name: 'проставлен вручную', at: manual, note: 'указано у самого утверждения' })

  const dated = parts.filter((p) => p.at) as { name: Component; at: Date; note: string }[]
  const earliest = dated.length ? dated.reduce((a, b) => (a.at <= b.at ? a : b)) : null

  return {
    at: earliest?.at ?? null,
    reason: earliest?.name ?? null,
    expired: !verified || (earliest ? earliest.at <= now : false),
    neverVerified: !verified,
    parts,
    volatile,
  }
}

/**
 * Нужна ли короткая перепроверка перед выпуском.
 *
 * Изменчивым типам мало того, что срок не истёк: за неделю до выпуска
 * дедлайн успевает переехать. Перепроверка при этом почти бесплатна — если
 * страница не изменилась, ответ придёт из кэша проверок.
 */
export function needsPrepublishRecheck(claim: ClaimRow, e: Expiry, now = new Date()): { need: boolean; why: string } {
  if (e.neverVerified) return { need: true, why: 'утверждение не проверялось ни разу' }
  if (e.expired) return { need: true, why: `годность кончилась: ${e.reason}` }
  if (!e.volatile) return { need: false, why: 'тип не изменчивый, хватает срока политики' }
  const ageDays = (now.getTime() - new Date(claim.verified_at!).getTime()) / day
  return ageDays > RECHECK_WINDOW_DAYS
    ? { need: true, why: `изменчивый тип, подтверждению ${Math.floor(ageDays)} дн.` }
    : { need: false, why: `изменчивый тип, но подтверждению меньше ${RECHECK_WINDOW_DAYS} дн.` }
}

/** Годность утверждений из базы: политика и снимки подтягиваются здесь. */
export async function expiryFor(seo: any, claimIds: number[], now = new Date()): Promise<Map<number, Expiry>> {
  const out = new Map<number, Expiry>()
  if (!claimIds.length) return out

  // Полный состав или урезанный: миграция состава утверждения может быть ещё
  // не применена, и это не повод не отвечать про срок годности вовсе.
  const FULL = 'id, kind, status, verified_at, valid_to, value_date, intake_start'
  const BASIC = 'id, kind, status, verified_at, valid_to, value_date'
  let res = await seo.from('claims').select(FULL).in('id', claimIds)
  if (res.error && /does not exist|schema cache/i.test(res.error.message)) {
    res = await seo.from('claims').select(BASIC).in('id', claimIds)
  }
  const claims = res.data
  if (!claims?.length) return out

  const kinds = [...new Set((claims as any[]).map((c) => c.kind))]
  const { data: policies } = await seo.from('claim_policy').select('kind, default_ttl').in('kind', kinds)
  const ttlByKind = new Map<string, string>((policies ?? []).map((p: any) => [p.kind, p.default_ttl]))

  // Какие источники подтверждают эти утверждения и не изменились ли они после.
  const { data: links } = await seo.from('claim_sources')
    .select('claim_id, snapshot_id, checked_at').in('claim_id', claimIds)
  const snapIds = [...new Set((links ?? []).map((l: any) => l.snapshot_id).filter(Boolean))]
  const { data: snaps } = snapIds.length
    ? await seo.from('source_snapshots').select('id, source_id').in('id', snapIds)
    : { data: [] }
  const sourceBySnap = new Map<number, number>((snaps ?? []).map((s: any) => [s.id, s.source_id]))
  const sourceIds = [...new Set([...sourceBySnap.values()])]

  const { data: later } = sourceIds.length
    ? await seo.from('source_snapshots').select('source_id, fetched_at, changed')
        .in('source_id', sourceIds).eq('changed', true).order('fetched_at', { ascending: true })
    : { data: [] }

  // Своя дата источника. Колонки может ещё не быть — тогда просто её нет.
  const datedBySource = new Map<number, Date>()
  if (sourceIds.length) {
    const r = await seo.from('sources').select('id, content_dated_at').in('id', sourceIds)
    if (!r.error) for (const s2 of (r.data ?? []) as any[]) {
      if (s2.content_dated_at) datedBySource.set(s2.id, new Date(s2.content_dated_at))
    }
  }

  for (const c of claims as any[]) {
    const mine = (links ?? []).filter((l: any) => l.claim_id === c.id)
    let changedAt: Date | null = null
    let datedAt: Date | null = null
    for (const l of mine) {
      const srcId = sourceBySnap.get(l.snapshot_id)
      if (!srcId) continue
      const d = datedBySource.get(srcId)
      // Несколько источников — берём самый старый: годность не может быть выше
      // годности самого слабого доказательства.
      if (d && (!datedAt || d < datedAt)) datedAt = d
      const after = (later ?? []).find((s: any) => s.source_id === srcId && new Date(s.fetched_at) > new Date(l.checked_at))
      if (after) {
        const at = new Date(after.fetched_at)
        if (!changedAt || at < changedAt) changedAt = at
      }
    }
    out.set(c.id, computeExpiry({ intake_start: null, ...c }, ttlByKind.get(c.kind) ?? null, changedAt, now, datedAt))
  }
  return out
}
