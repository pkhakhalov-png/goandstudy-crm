/**
 * Поток статей: конвейер сам берёт тему и запускает работу.
 *
 * Смысл настройки — не «писать побольше», а держать ровный ритм и не залить
 * очередь на вычитку. Поэтому два ограничителя: сколько статей в неделю и
 * сколько незакрытых висит на разборе. Второй важнее: если человек не успевает
 * читать, писать быстрее бессмысленно.
 */
export type FlowSettings = {
  enabled: boolean
  perWeek: number
  maxInReview: number
}

export const FLOW_DEFAULTS: FlowSettings = { enabled: false, perWeek: 3, maxInReview: 5 }

export async function loadFlow(seo: any): Promise<FlowSettings> {
  const { data } = await seo.from('settings').select('value').eq('key', 'article_flow').maybeSingle()
  const v = (data?.value ?? {}) as Partial<FlowSettings>
  return {
    enabled: v.enabled ?? FLOW_DEFAULTS.enabled,
    perWeek: Math.min(20, Math.max(1, Number(v.perWeek ?? FLOW_DEFAULTS.perWeek))),
    maxInReview: Math.min(30, Math.max(1, Number(v.maxInReview ?? FLOW_DEFAULTS.maxInReview))),
  }
}

export async function saveFlow(seo: any, next: FlowSettings): Promise<void> {
  await seo.from('settings').upsert({ key: 'article_flow', value: next }, { onConflict: 'key' })
}

export type PickedTopic = {
  id: number
  query: string
  impressions: number
  /** Почему тема безопасна — показывается человеку рядом с темой. */
  cannibalReason: string
}

export type FlowState = {
  settings: FlowSettings
  startedThisWeek: number
  inReview: number
  /** Когда конвейер возьмётся за следующую статью. */
  nextRunAt: string | null
  /** Почему сейчас ничего не запускается; пусто — значит запустится. */
  blocker: string | null
  nextTopic: PickedTopic | null
  /** Темы, отброшенные из-за каннибализации — чтобы решение было видно. */
  skipped: { query: string; verdict: string; reason: string; updateTarget: string | null }[]
}

/** Понедельник текущей недели — по нему считаем, сколько уже сделано. */
function weekStart(): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString()
}

/**
 * Промежуток между статьями. Ритм, а не недельная квота: при семи статьях в
 * неделю — раз в сутки. Квота выбиралась ручными запусками и глушила конвейер
 * до конца недели, ритм же просто выдерживает паузу.
 */
export function intervalMs(perWeek: number): number {
  return Math.round((7 * 864e5) / Math.max(1, perWeek))
}

async function lastAutoRun(seo: any): Promise<number> {
  const { data } = await seo.from('settings').select('value').eq('key', 'last_auto_article').maybeSingle()
  const at = (data?.value as any)?.at
  return at ? Date.parse(at) : 0
}

export async function markAutoRun(seo: any): Promise<void> {
  await seo.from('settings').upsert({ key: 'last_auto_article', value: { at: new Date().toISOString() } }, { onConflict: 'key' })
}

/**
 * Готовый ответ для экрана. Полный расчёт стоит двадцать секунд — столько
 * держать человека перед пустой страницей нельзя, поэтому считает воркер раз в
 * час, а экран читает посчитанное.
 */
export async function flowSnapshot(seo: any): Promise<FlowState & { computedAt: string | null }> {
  const settings = await loadFlow(seo)

  const { data } = await seo.from('settings').select('value').eq('key', 'flow_snapshot').maybeSingle()
  const snap = data?.value as (FlowState & { computedAt: string }) | undefined

  const { count: inReview } = await seo.from('articles')
    .select('*', { count: 'exact', head: true })
    .in('status', ['ready_for_review', 'in_review'])

  if (!snap) {
    return {
      settings, startedThisWeek: 0, inReview: inReview ?? 0, nextRunAt: null,
      blocker: 'тема ещё не подобрана — подождите проход воркера',
      nextTopic: null, skipped: [], computedAt: null,
    }
  }

  // Настройки и очередь на вычитку берём свежими: они меняются нажатием кнопки,
  // и показывать по ним вчерашнее значение было бы враньём
  return { ...snap, settings, inReview: inReview ?? 0 }
}

export async function saveSnapshot(seo: any, state: FlowState): Promise<void> {
  await seo.from('settings').upsert(
    { key: 'flow_snapshot', value: { ...state, computedAt: new Date().toISOString() } },
    { onConflict: 'key' },
  )
}

/** Полный расчёт. Дорогой: перечитывает запросную статистику целиком. */
export async function flowState(seo: any): Promise<FlowState> {
  const settings = await loadFlow(seo)

  const { count: startedThisWeek } = await seo.from('jobs')
    .select('*', { count: 'exact', head: true })
    .eq('step', 'article_brief').gte('created_at', weekStart())

  const { count: inReview } = await seo.from('articles')
    .select('*', { count: 'exact', head: true })
    .in('status', ['ready_for_review', 'in_review'])

  const picked = await pickTopic(seo, { withSkipped: true })
  const nextTopic = picked.topic

  const last = await lastAutoRun(seo)
  const readyAt = last + intervalMs(settings.perWeek)
  const nextRunAt = settings.enabled ? new Date(Math.max(readyAt, Date.now())).toISOString() : null

  let blocker: string | null = null
  if (!settings.enabled) blocker = 'поток выключен'
  else if ((inReview ?? 0) >= settings.maxInReview) blocker = `на вычитке ${inReview} — больше не берём, пока не разберёте`
  else if (Date.now() < readyAt) {
    const hours = Math.max(1, Math.round((readyAt - Date.now()) / 36e5))
    blocker = `следующая статья через ${hours} ${hours === 1 ? 'час' : hours < 5 ? 'часа' : 'часов'} — держим ритм`
  } else if (!nextTopic) {
    blocker = picked.skipped.length
      ? `свободных тем нет: ${picked.skipped.length} отброшено из-за каннибализации`
      : 'нет свободных тем — нужен новый разбор запросов'
  }

  return {
    settings, startedThisWeek: startedThisWeek ?? 0, inReview: inReview ?? 0,
    nextRunAt, blocker, nextTopic, skipped: picked.skipped,
  }
}

/**
 * Следующая тема: самая ценная из непочатых и безопасных.
 *
 * Отбрасываем два вида тем. Первый — те, по которым статья уже писалась или
 * пишется. Второй, и он важнее: те, чьи запросы уже держит своя страница.
 * Написать по такой теме новую статью — значит отобрать запросы у собственной
 * страницы, а не привести новых людей. Проверка идёт по семьям запросов, а не
 * по похожести текстов: две разные статьи прекрасно дерутся за один запрос.
 */
export async function pickTopic(
  seo: any,
  opts: { withSkipped?: boolean } = {},
): Promise<{ topic: PickedTopic | null; skipped: FlowState['skipped'] }> {
  const { data: topics } = await seo.from('topics')
    .select('id, title, primary_keyword, search_volume, priority')
    .eq('status', 'new').eq('origin', 'gsc_gap')
    .order('priority', { ascending: false, nullsFirst: false })
    .limit(40)
  const skipped: FlowState['skipped'] = []
  if (!topics?.length) return { topic: null, skipped }

  const ids = topics.map((t: any) => t.id)
  const { data: used } = await seo.from('articles').select('topic_id').in('topic_id', ids)
  const { data: queued } = await seo.from('jobs').select('topic_id')
    .like('step', 'article_%').in('status', ['pending', 'running', 'waiting']).in('topic_id', ids)

  const taken = new Set<number>([
    ...(used ?? []).map((r: any) => r.topic_id),
    ...(queued ?? []).map((r: any) => r.topic_id),
  ].filter(Boolean))

  const free = topics.filter((t: any) => !taken.has(t.id))
  if (!free.length) return { topic: null, skipped }

  const { loadQueryRows, verdictFor, sameFamily } = await import('./cannibal')
  const rows = await loadQueryRows(seo)

  // Свои же статьи и темы: проверка по показам их не видит, пока они не начали
  // ранжироваться. Без этого конвейер за неделю написал бы четыре статьи об
  // одном и том же — просто разными словами.
  const { data: mine } = await seo.from('articles').select('primary_keyword')
  const { data: busy } = await seo.from('topics').select('title, primary_keyword')
    .in('status', ['in_production', 'produced'])
  const ourQueries = [
    ...(mine ?? []).map((r: any) => r.primary_keyword),
    ...(busy ?? []).map((r: any) => r.primary_keyword ?? r.title),
  ].filter(Boolean) as string[]

  for (const t of free) {
    const query = t.primary_keyword ?? t.title

    const twin = ourQueries.find((q) => sameFamily(q, query))
    if (twin) {
      skipped.push({
        query, verdict: 'update',
        reason: `то же самое другими словами — у нас уже есть «${twin}»`,
        updateTarget: null,
      })
      continue
    }

    const v = verdictFor(rows, query)
    if (v.verdict === 'safe') {
      // Тема занимает свою семью: следующие формулировки того же уже не пройдут
      ourQueries.push(query)
      return { topic: { id: t.id, query, impressions: t.search_volume ?? 0, cannibalReason: v.reason }, skipped }
    }
    skipped.push({ query, verdict: v.verdict, reason: v.reason, updateTarget: v.updateTarget })
    if (!opts.withSkipped && skipped.length > 20) break
  }
  return { topic: null, skipped }
}
