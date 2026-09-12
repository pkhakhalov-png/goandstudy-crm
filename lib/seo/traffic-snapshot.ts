/**
 * Готовые итоги по страницам — чтобы экраны не пересчитывали их при каждом открытии.
 *
 * Экранам «Обзор» и «Страницы» нужны суммы: сколько кликов и показов собрала
 * каждая страница и сайт целиком. Считались они так: прочитать все восемнадцать
 * тысяч дневных строк (восемнадцать запросов, два с половиной мегабайта) и
 * сложить в памяти. На каждое открытие. Ради шести чисел на «Обзоре».
 *
 * Теперь итоги считает воркер и кладёт их в seo.settings, а экран читает
 * готовое. Тот же приём уже применён к снимку позиций и состоянию конвейера.
 *
 * ПОЧЕМУ ЦИФРЫ ОТ ЭТОГО НЕ УСТАРЕЮТ. Единственный, кто пишет в gsc_page_daily,
 * — шаг gsc_import. Он же пересчитывает этот снимок сразу после записи, так что
 * между импортами данные не меняются и снимок всегда точен. На случай, если
 * снимка нет или он от старых данных, остаётся живой расчёт — тот же самый,
 * что был раньше. Проверка дешёвая: последняя дата и число строк.
 */
import { loadPageDays, type PageDay } from './gsc-agg'

export type PageTotals = {
  /** клики */
  c: number
  /** показы */
  i: number
  /** сумма позиций, взвешенных по показам: делить на i, чтобы получить среднюю */
  pw: number
  /** последний день с показами */
  last: string | null
}

export type TrafficSnapshot = {
  computedAt: string
  /** Самая поздняя дата в данных на момент расчёта. */
  dataThrough: string | null
  /** Сколько дневных строк учтено: вместе с датой отличает свежий снимок от старого. */
  rowCount: number
  totals: { clicks: number; impressions: number }
  /** Последние 28 дней и предыдущие 28 — якорь по самой поздней дате данных. */
  cur: { clicks: number; impr: number }
  prev: { clicks: number; impr: number }
  byPage: Record<string, PageTotals>
}

const KEY = 'traffic_snapshot'
const DAY = 86400000

/** Полный расчёт по всей истории. Дорогой — на то он и снимок. */
export function summarizeAll(rows: PageDay[]): Omit<TrafficSnapshot, 'computedAt'> {
  let maxDate = ''
  for (const r of rows) if (r.date > maxDate) maxDate = r.date
  const anchor = maxDate ? Date.parse(maxDate) : 0

  const byPage: Record<string, PageTotals> = {}
  let totalClicks = 0, totalImpr = 0
  const cur = { clicks: 0, impr: 0 }
  const prev = { clicks: 0, impr: 0 }

  for (const r of rows) {
    totalClicks += r.clicks
    totalImpr += r.impressions

    const age = (anchor - Date.parse(r.date)) / DAY
    if (age < 28) { cur.clicks += r.clicks; cur.impr += r.impressions }
    else if (age < 56) { prev.clicks += r.clicks; prev.impr += r.impressions }

    const t = byPage[r.normalized_url] ?? (byPage[r.normalized_url] = { c: 0, i: 0, pw: 0, last: null })
    t.c += r.clicks
    t.i += r.impressions
    t.pw += (r.position || 0) * (r.impressions || 0)
    if (r.impressions > 0 && (!t.last || r.date > t.last)) t.last = r.date
  }

  return { dataThrough: maxDate || null, rowCount: rows.length, totals: { clicks: totalClicks, impressions: totalImpr }, cur, prev, byPage }
}

export async function computeTrafficSnapshot(seo: any): Promise<TrafficSnapshot> {
  const rows = await loadPageDays(seo)
  return { computedAt: new Date().toISOString(), ...summarizeAll(rows) }
}

export async function saveTrafficSnapshot(seo: any, snap: TrafficSnapshot): Promise<void> {
  const { error } = await seo.from('settings').upsert({ key: KEY, value: snap }, { onConflict: 'key' })
  // Молча проглоченная ошибка записи здесь означала бы, что экраны неделями
  // показывают итоги от старых данных и никто об этом не узнает
  if (error) throw new Error(`снимок трафика не сохранился: ${error.message}`)
}

/**
 * Итоги для экрана: готовые, если они посчитаны по текущим данным, иначе —
 * посчитанные на месте. Второй случай не должен случаться в обычной работе;
 * он оставлен, чтобы экран никогда не показал устаревшие числа.
 */
export async function trafficSnapshot(seo: any): Promise<{ snap: TrafficSnapshot; fresh: boolean }> {
  const [{ data: row }, { data: last }, { count }] = await Promise.all([
    seo.from('settings').select('value').eq(  'key', KEY).maybeSingle(),
    seo.from('gsc_page_daily').select('date').order('date', { ascending: false }).limit(1),
    seo.from('gsc_page_daily').select('*', { count: 'exact', head: true }),
  ])

  const snap = (row?.value ?? null) as TrafficSnapshot | null
  const through = (last ?? [])[0]?.date ?? null

  if (snap && snap.dataThrough === through && snap.rowCount === (count ?? -1)) {
    return { snap, fresh: true }
  }
  return { snap: await computeTrafficSnapshot(seo), fresh: false }
}
