/**
 * Отчёт «Результат»: что принесли переходы.
 *
 * Правило честности здесь важнее удобства, и PRD называет его отдельным
 * пунктом. Три вещи, которые отчёт НЕ делает:
 *
 * 1. Не показывает ноль там, где нечего показать. «Ноль заявок» и «заявки не
 *    измеряются» выглядят одинаково в таблице, но значат противоположное:
 *    первое — плохой результат, второе — отсутствие измерения. Поэтому
 *    неизмеримое возвращается как `unavailable` с причиной, а не как 0.
 *
 * 2. Не складывает первое и последнее касание. Одна заявка — это одно первое
 *    касание и одно последнее, а не две заявки. Сумма колонок здесь не имеет
 *    смысла, и сам отчёт её не считает.
 *
 * 3. Не приписывает переходы некликабельным ссылкам. Если в посте ссылка не
 *    кликается — а в некоторых соцсетях так и есть, — переходов с него быть не
 *    может, и приписывать их туда нельзя. Пока каналов нет, правило записано
 *    как тип: канал может честно сказать, что переходы у него не измеряются.
 */

/** Значение, которое может быть неизмеримым. Ноль и «не знаем» — разные вещи. */
export type Metric = { kind: 'value'; value: number } | { kind: 'unavailable'; why: string }

export const value = (n: number): Metric => ({ kind: 'value', value: n })
export const unavailable = (why: string): Metric => ({ kind: 'unavailable', why })

export type ResultRow = {
  /** По чему сгруппировано: страница, канал или кампания. */
  key: string
  label: string
  /** Просмотры страницы. */
  views: Metric
  /** Заявки, где это было ПЕРВЫМ касанием. */
  leadsFirst: Metric
  /** Заявки, где это было ПОСЛЕДНИМ касанием. Складывать с первым нельзя. */
  leadsLast: Metric
  /** Состоявшиеся консультации по этим заявкам. */
  consultations: Metric
  /** Сделки, заведённые по этим заявкам. */
  deals: Metric
}

export type ResultReport = {
  byPage: ResultRow[]
  byChannel: ResultRow[]
  /** Что в этом отчёте пока нельзя измерить и почему. */
  gaps: string[]
  from: string
  to: string
  takenAt: string
}

/**
 * Собрать отчёт за период.
 *
 * Границы по датам обязательны: «за всё время» в отчёте о результате почти
 * всегда вводит в заблуждение — счётчик переходов включён сегодня, а заявки
 * копятся с сентября, и общая таблица покажет заявки без переходов и выводы
 * из этого будут неверными.
 */
export async function buildResultReport(
  seo: any,
  sb: any,
  from: string,
  to: string,
): Promise<ResultReport> {
  const gaps: string[] = []

  // ── Переходы ──────────────────────────────────────────────────────────────
  const { data: events } = await seo.from('attribution_events')
    .select('page_id, url, utm, referrer, anon_id, created_at')
    .gte('created_at', from).lte('created_at', to).limit(20000)

  // ── Заявки с цепочкой касаний ─────────────────────────────────────────────
  //
  // Колонки меток касания добавляет миграция 20260917070000. Пока её нет,
  // запрос с ними падает целиком — и отчёт остался бы без заявок вовсе.
  // Поэтому пробуем полный набор, а при отказе берём то, что есть, и честно
  // говорим в пробелах, чего не хватает.
  const FULL = 'id, external_lead_id, lead_at, deal_id, first_touch_page, last_touch_page, first_touch_utm, last_touch_utm'
  const BASIC = 'id, external_lead_id, lead_at, deal_id, first_touch_page, last_touch_page'

  let leads: any[] = []
  const full = await seo.from('lead_identities').select(FULL)
    .gte('lead_at', from).lte('lead_at', to).limit(5000)
  if (full.error) {
    if (!/column|does not exist|schema cache/i.test(full.error.message)) {
      throw new Error(`заявки не прочитались: ${full.error.message}`)
    }
    gaps.push('метки кампании у касаний не измеряются — не применена миграция 20260917070000')
    const basic = await seo.from('lead_identities').select(BASIC)
      .gte('lead_at', from).lte('lead_at', to).limit(5000)
    if (basic.error) throw new Error(`заявки не прочитались: ${basic.error.message}`)
    leads = basic.data ?? []
  } else {
    leads = full.data ?? []
  }

  // ── Консультации ──────────────────────────────────────────────────────────
  const bookingIds = leads.map((l: any) => l.external_lead_id).filter(Boolean)
  let doneByBooking = new Set<string>()
  if (bookingIds.length) {
    const { data: bk } = await sb.from('bookings').select('id, status').in('id', bookingIds)
    doneByBooking = new Set((bk ?? []).filter((b: any) => b.status === 'completed').map((b: any) => String(b.id)))
  }

  // ── Названия страниц ──────────────────────────────────────────────────────
  const pageIds = [...new Set([
    ...(events ?? []).map((e: any) => e.page_id),
    ...leads.flatMap((l: any) => [l.first_touch_page, l.last_touch_page]),
  ].filter(Boolean))] as number[]
  const { data: pages } = pageIds.length
    ? await seo.from('pages').select('id, normalized_url, title').in('id', pageIds)
    : { data: [] }
  const pageLabel = new Map<number, string>(
    (pages ?? []).map((p: any) => [p.id, String(p.normalized_url).replace('https://goandstudy.com', '') || '/']),
  )

  // ── Сборка по страницам ───────────────────────────────────────────────────
  const rows = new Map<string, { label: string; views: number; first: number; last: number; cons: number; deals: number }>()
  const row = (key: string, label: string) => {
    if (!rows.has(key)) rows.set(key, { label, views: 0, first: 0, last: 0, cons: 0, deals: 0 })
    return rows.get(key)!
  }

  for (const e of events ?? []) {
    const id = (e as any).page_id
    if (!id) continue                                  // адрес не в реестре — не приписываем никуда
    row(`p:${id}`, pageLabel.get(id) ?? `страница #${id}`).views++
  }
  for (const l of leads) {
    if (l.first_touch_page) row(`p:${l.first_touch_page}`, pageLabel.get(l.first_touch_page) ?? `страница #${l.first_touch_page}`).first++
    if (l.last_touch_page) {
      const r = row(`p:${l.last_touch_page}`, pageLabel.get(l.last_touch_page) ?? `страница #${l.last_touch_page}`)
      r.last++
      if (doneByBooking.has(String(l.external_lead_id))) r.cons++
      if (l.deal_id) r.deals++
    }
  }

  const byPage: ResultRow[] = [...rows.entries()]
    .map(([key, r]) => ({
      key, label: r.label,
      views: value(r.views),
      leadsFirst: value(r.first),
      leadsLast: value(r.last),
      consultations: value(r.cons),
      deals: value(r.deals),
    }))
    .sort((a, b) => (b.views as any).value - (a.views as any).value)

  // ── Сборка по каналам ─────────────────────────────────────────────────────
  //
  // Канал — это utm_source из меток. Пока постов нет, почти всё придёт без
  // меток: это переходы внутри сайта и из поиска. Такие строки честно
  // называются «без метки», а не приписываются несуществующей кампании.
  const ch = new Map<string, { views: number; first: number; last: number; cons: number; deals: number }>()
  const chRow = (k: string) => {
    if (!ch.has(k)) ch.set(k, { views: 0, first: 0, last: 0, cons: 0, deals: 0 })
    return ch.get(k)!
  }
  for (const e of events ?? []) {
    chRow(String((e as any).utm?.utm_source ?? 'без метки')).views++
  }
  for (const l of leads) {
    chRow(String(l.first_touch_utm?.utm_source ?? 'без метки')).first++
    const k = String(l.last_touch_utm?.utm_source ?? 'без метки')
    const r = chRow(k)
    r.last++
    if (doneByBooking.has(String(l.external_lead_id))) r.cons++
    if (l.deal_id) r.deals++
  }

  const byChannel: ResultRow[] = [...ch.entries()]
    .map(([key, r]) => ({
      key, label: key,
      views: value(r.views),
      leadsFirst: value(r.first),
      leadsLast: value(r.last),
      consultations: value(r.cons),
      deals: value(r.deals),
    }))
    .sort((a, b) => (b.views as any).value - (a.views as any).value)

  // ── Что честно сказать про пробелы ────────────────────────────────────────
  const firstEvent = (events ?? [])[0]?.created_at
  if (!events?.length) {
    gaps.push('переходов за период нет — счётчик включён 17 сентября, раньше их никто не считал')
  } else if (firstEvent && leads.some((l: any) => l.lead_at < firstEvent)) {
    gaps.push('часть заявок старше первого измеренного перехода: у них переходов не будет, и это не ноль, а отсутствие измерения')
  }
  gaps.push('пакеты и публикации ещё не заведены — utm_campaign и utm_content пока пусты у всех переходов')

  return { byPage, byChannel, gaps, from, to, takenAt: new Date().toISOString() }
}
