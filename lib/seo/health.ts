/**
 * Здоровье очереди: что видно до того, как кто-то пожаловался.
 *
 * PRD E1.10 требует конкретный набор: глубина очереди по дорожкам, **возраст
 * самой старой ждущей задачи по каждой дорожке**, доля ошибок, признаки жизни
 * исполнителей и остаток бюджета. Возраст старейшей задачи стоит там отдельным
 * пунктом не случайно: глубина очереди врёт. Десять задач, разобранных за
 * минуту, и одна, висящая третьи сутки, дают одинаковую «глубину 1..10», но
 * первое — норма, а второе — голодание дорожки.
 *
 * Модуль намеренно читает только то, что есть всегда. Поля аренды и таблицы
 * учёта появляются миграциями E1; пока их нет, соответствующие показатели
 * возвращаются как «неизвестно», а не как ноль. Ноль здесь означал бы
 * «проверено, всё хорошо» — и это была бы ложь.
 */

export type LaneHealth = {
  lane: string
  pending: number
  /**
   * Сколько из ждущих уже должны были начаться.
   *
   * Отличать обязательно: задача с отложенным повтором ждёт законно, и мешать
   * её с задачей, до которой никто не дошёл, значит либо поднимать тревогу на
   * здоровом ретрае, либо прятать настоящее голодание за словом «ждут».
   */
  pendingDue: number
  running: number
  waiting: number
  /** Возраст самой старой ждущей задачи в минутах. null — ждущих нет. */
  oldestPendingMin: number | null
  /** Сколько задач этой дорожки упало за сутки. */
  failed24h: number
  /** Сколько завершилось за сутки — знаменатель доли ошибок. */
  done24h: number
}

export type WorkerHealth = {
  worker: string
  lastSeenMin: number
  jobs: number
  /** null — колонок аренды ещё нет, о свежести сердцебиения судить нельзя. */
  heartbeatFreshMin: number | null
}

export type QueueHealth = {
  lanes: LaneHealth[]
  workers: WorkerHealth[]
  /** null — таблиц учёта ещё нет. */
  budget: { scope: string; limit: number; used: number; left: number }[] | null
  /** Показатели, которых пока нет, и почему. */
  gaps: string[]
  takenAt: string
}

const MIN = 60_000
const minutesSince = (iso: string | null | undefined): number | null =>
  iso ? Math.round((Date.now() - Date.parse(iso)) / MIN) : null

export async function queueHealth(seo: any): Promise<QueueHealth> {
  const gaps: string[] = []
  const dayAgo = new Date(Date.now() - 24 * 60 * MIN).toISOString()

  // Живая часть очереди мала — её можно прочитать целиком. Терминальные задачи
  // за сутки считаем отдельно и только по счётчикам, чтобы не тащить историю.
  const { data: live, error: liveErr } = await seo
    .from('jobs')
    .select('id, lane, status, next_run_at, created_at, locked_by, locked_at, heartbeat_at')
    .in('status', ['pending', 'running', 'waiting'])
    .limit(5000)

  // heartbeat_at появляется миграцией аренды. Если её нет, повторяем запрос без
  // этой колонки: остальное считать можно и нужно.
  let rows = live
  let hasLease = true
  if (liveErr && /heartbeat_at|column/i.test(liveErr.message)) {
    hasLease = false
    gaps.push('свежесть сердцебиения — нет колонок аренды (миграция 20260917010000)')
    const retry = await seo.from('jobs')
      .select('id, lane, status, next_run_at, created_at, locked_by, locked_at')
      .in('status', ['pending', 'running', 'waiting']).limit(5000)
    rows = retry.data
  } else if (liveErr) {
    throw new Error(`очередь не прочиталась: ${liveErr.message}`)
  }

  const byLane = new Map<string, LaneHealth>()
  const lane = (name: string): LaneHealth => {
    if (!byLane.has(name)) {
      byLane.set(name, { lane: name, pending: 0, pendingDue: 0, running: 0, waiting: 0, oldestPendingMin: null, failed24h: 0, done24h: 0 })
    }
    return byLane.get(name)!
  }

  for (const j of rows ?? []) {
    const l = lane(j.lane)
    if (j.status === 'pending') {
      l.pending++
      // Считаем от next_run_at, а не от created_at: задача с отложенным
      // повтором ждёт законно, и записывать ей возраст с момента создания
      // значило бы поднимать тревогу на здоровом ретрае.
      const due = j.next_run_at ?? j.created_at
      const age = minutesSince(due)
      if (age != null && age >= 0) {
        l.pendingDue++
        if (l.oldestPendingMin == null || age > l.oldestPendingMin) l.oldestPendingMin = age
      }
    } else if (j.status === 'running') l.running++
    else if (j.status === 'waiting') l.waiting++
  }

  // Доля ошибок за сутки. Считаем по всем дорожкам сразу, одним проходом.
  const { data: recent } = await seo.from('jobs')
    .select('lane, status')
    .in('status', ['done', 'failed'])
    .gte('created_at', dayAgo)
    .limit(5000)
  for (const j of recent ?? []) {
    const l = lane(j.lane)
    if (j.status === 'failed') l.failed24h++
    else l.done24h++
  }

  // Исполнители: кто держит задачи прямо сейчас и когда подавал признаки жизни.
  const workers = new Map<string, WorkerHealth>()
  for (const j of rows ?? []) {
    if (j.status !== 'running' || !j.locked_by) continue
    const w = workers.get(j.locked_by) ?? {
      worker: j.locked_by, lastSeenMin: Number.POSITIVE_INFINITY, jobs: 0, heartbeatFreshMin: null,
    }
    w.jobs++
    const seen = minutesSince(j.locked_at) ?? Number.POSITIVE_INFINITY
    w.lastSeenMin = Math.min(w.lastSeenMin, seen)
    if (hasLease) {
      const beat = minutesSince(j.heartbeat_at)
      if (beat != null) w.heartbeatFreshMin = Math.min(w.heartbeatFreshMin ?? beat, beat)
    }
    workers.set(j.locked_by, w)
  }

  // Остаток бюджета — из таблиц учёта, если они уже есть.
  let budget: QueueHealth['budget'] = null
  const { data: left, error: budErr } = await seo.rpc('budget_left')
  if (budErr) {
    gaps.push('остаток бюджета — нет таблиц учёта (миграция 20260917030000)')
  } else {
    budget = (left ?? []).map((r: any) => ({
      scope: r.scope, limit: Number(r.limit_usd), used: Number(r.used_usd), left: Number(r.left_usd),
    }))
  }

  return {
    lanes: [...byLane.values()].sort((a, b) => a.lane.localeCompare(b.lane)),
    workers: [...workers.values()].sort((a, b) => a.lastSeenMin - b.lastSeenMin),
    budget,
    gaps,
    takenAt: new Date().toISOString(),
  }
}

/**
 * Пороги тревоги по возрасту старейшей задачи.
 *
 * Разные у разных дорожек, потому что «нормально» у них разное: производство
 * статьи запускается раз в сутки, а публикация должна уходить за минуты.
 */
export const LANE_STALE_MIN: Record<string, number> = {
  production: 180,
  crawl: 24 * 60,
  gsc: 24 * 60,
  findings: 24 * 60,
  freshness: 24 * 60,
  index: 24 * 60,
  attribution: 24 * 60,
  autopilot: 180,
  social_publish: 30,
  social_metrics: 12 * 60,
  content_generation: 180,
  content_review: 180,
}

export function laneIsStale(l: LaneHealth): boolean {
  if (l.oldestPendingMin == null) return false
  return l.oldestPendingMin > (LANE_STALE_MIN[l.lane] ?? 24 * 60)
}

/** Человеческое описание состояния дорожки — одно и то же в экране и в алерте. */
export function laneNote(l: LaneHealth): string {
  if (laneIsStale(l)) return `голодание: старейшая ждёт ${l.oldestPendingMin} мин`
  if (l.pending > 0 && l.pendingDue === 0) return 'ждут своего срока'
  if (l.pending === 0 && l.running === 0 && l.waiting === 0) return 'пусто'
  return 'в норме'
}
