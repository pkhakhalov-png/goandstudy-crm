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

export type FlowState = {
  settings: FlowSettings
  startedThisWeek: number
  inReview: number
  /** Почему сейчас ничего не запускается; пусто — значит запустится. */
  blocker: string | null
  nextTopic: { id: number; query: string; impressions: number } | null
}

/** Понедельник текущей недели — по нему считаем недельную норму. */
function weekStart(): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString()
}

export async function flowState(seo: any): Promise<FlowState> {
  const settings = await loadFlow(seo)

  const { count: startedThisWeek } = await seo.from('jobs')
    .select('*', { count: 'exact', head: true })
    .eq('step', 'article_brief').gte('created_at', weekStart())

  const { count: inReview } = await seo.from('articles')
    .select('*', { count: 'exact', head: true })
    .in('status', ['ready_for_review', 'in_review'])

  const nextTopic = await pickTopic(seo)

  let blocker: string | null = null
  if (!settings.enabled) blocker = 'поток выключен'
  else if ((inReview ?? 0) >= settings.maxInReview) blocker = `на вычитке ${inReview} — больше не берём, пока не разберёте`
  else if ((startedThisWeek ?? 0) >= settings.perWeek) blocker = `недельная норма выбрана: ${startedThisWeek} из ${settings.perWeek}`
  else if (!nextTopic) blocker = 'нет свободных тем — нужен новый разбор запросов'

  return { settings, startedThisWeek: startedThisWeek ?? 0, inReview: inReview ?? 0, blocker, nextTopic }
}

/**
 * Следующая тема: самая ценная из непочатых. Темы, по которым статья уже
 * писалась или пишется, отбрасываем — иначе конвейер начнёт бодать сам себя.
 */
export async function pickTopic(seo: any): Promise<{ id: number; query: string; impressions: number } | null> {
  const { data: topics } = await seo.from('topics')
    .select('id, title, primary_keyword, search_volume, priority')
    .eq('status', 'new').eq('origin', 'gsc_gap')
    .order('priority', { ascending: false, nullsFirst: false })
    .limit(40)
  if (!topics?.length) return null

  const ids = topics.map((t: any) => t.id)
  const { data: used } = await seo.from('articles').select('topic_id').in('topic_id', ids)
  const { data: queued } = await seo.from('jobs').select('topic_id')
    .like('step', 'article_%').in('status', ['pending', 'running', 'waiting']).in('topic_id', ids)

  const taken = new Set<number>([
    ...(used ?? []).map((r: any) => r.topic_id),
    ...(queued ?? []).map((r: any) => r.topic_id),
  ].filter(Boolean))

  const free = topics.find((t: any) => !taken.has(t.id))
  if (!free) return null
  return { id: free.id, query: free.primary_keyword ?? free.title, impressions: free.search_volume ?? 0 }
}
