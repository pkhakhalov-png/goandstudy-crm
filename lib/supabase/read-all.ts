/**
 * Чтение таблицы целиком, без молчаливой потери строк.
 *
 * Зачем это нужно. Клиент Supabase отдаёт максимум тысячу строк за запрос и
 * при этом не считает лишнее ошибкой: `select` просто возвращает первую тысячу,
 * а остальное исчезает. Экран показывает цифры, все им верят, и никто не
 * узнает, что треть данных не дошла. Из всех ошибок в этом проекте эта —
 * самая тихая, поэтому для любой растущей таблицы читать надо так.
 *
 * Про порядок строк. Postgres не обещает одинаковую последовательность строк
 * между запросами, если её не задать явно. Без `order` соседние страницы
 * выдачи могут перекрыться или разойтись — и тогда постраничное чтение само
 * станет источником неверных цифр. Поэтому порядок здесь обязателен: функция
 * не угадывает его, а требует от вызывающего.
 */

type Query = any

export type ReadAllOptions = {
  /** Размер страницы. Больше тысячи не имеет смысла — столько отдаёт сервер. */
  pageSize?: number
  /** Сколько страниц тянуть одновременно, когда известно общее число строк. */
  batch?: number
  /** Имя для сообщения об ошибке: без него непонятно, что именно не прочиталось. */
  label?: string
}

/**
 * @param build фабрика запроса без `range`. Обязана задавать порядок строк
 *              через `.order(...)` — иначе постраничное чтение неверно.
 *
 * Пример:
 *   const deals = await readAll(() =>
 *     supabase.from('deals').select('id, title').is('deleted_at', null).order('id'))
 */
export async function readAll<T = any>(build: () => Query, opts: ReadAllOptions = {}): Promise<T[]> {
  const pageSize = Math.min(opts.pageSize ?? 1000, 1000)
  const batch = Math.max(1, opts.batch ?? 6)
  const label = opts.label ?? 'выборка'

  // Первая страница заодно приносит общее число строк: сервер кладёт его в
  // заголовок Content-Range, если попросить. Отдельный запрос за счётом стоил
  // бы лишнего похода до базы — а поход здесь дороже самих данных.
  const firstQuery: any = build().range(0, pageSize - 1)
  if (typeof firstQuery.setHeader === 'function') firstQuery.setHeader('Prefer', 'count=exact')
  const first = await firstQuery
  if (first.error) throw new Error(`${label}: ${first.error.message}`)

  const rows: T[] = (first.data ?? []) as T[]
  if (rows.length < pageSize) return rows

  const total: number | null = typeof first.count === 'number' ? first.count : null

  if (total === null) {
    // Счёт не получился — читаем по одной странице, пока выдача не станет короче
    for (let from = pageSize; ; from += pageSize) {
      const next = await build().range(from, from + pageSize - 1)
      if (next.error) throw new Error(`${label}: ${next.error.message}`)
      const data = (next.data ?? []) as T[]
      rows.push(...data)
      if (data.length < pageSize) break
    }
    return rows
  }

  const pages = Math.ceil(total / pageSize)
  for (let start = 1; start < pages; start += batch) {
    const chunk = await Promise.all(
      Array.from({ length: Math.min(batch, pages - start) }, (_, i) => {
        const from = (start + i) * pageSize
        return build().range(from, from + pageSize - 1).then((r: any) => {
          if (r.error) throw new Error(`${label}: ${r.error.message}`)
          return (r.data ?? []) as T[]
        })
      }),
    )
    for (const part of chunk) rows.push(...part)
  }
  return rows
}

/**
 * Чтение большой таблицы по дням, а не страницами со смещением.
 *
 * Зачем понадобился второй способ. `readAll` просит у сервера страницу через
 * `range`, то есть `OFFSET`. Postgres не умеет перепрыгнуть через смещение: он
 * честно прокручивает все строки до него и выбрасывает. На `gsc_daily` в 190
 * тысяч строк это видно на замере: первая страница отдаётся за 343 мс, а
 * страница со смещением 100 000 — за 1847 мс. Чем дальше, тем дороже, и это
 * не лечится индексом. Плюс `count: exact` по такой таблице стоил 1,7 с сам по
 * себе: сервер считает строки проходом.
 *
 * Поэтому здесь выдача режется не по числу строк, а по дате: один запрос — один
 * день. Смещения внутри дня остаются маленькими (в `gsc_daily` это полторы
 * тысячи строк), общий счёт не нужен вовсе, а дни читаются пачками параллельно.
 * Замер на окне в 90 дней: 6,7 с смещениями против 3,6 с по дням, строки и
 * суммы совпадают до единицы.
 *
 * Когда так делать НЕ надо. Способ выгоден, только если в дне набирается около
 * страницы строк и больше. У `gsc_page_daily` в дне полторы сотни строк: 133
 * запроса по дням вместо 19 страницами — это медленнее, а не быстрее. Для неё
 * остаётся `readAll`.
 *
 * Про порядок. Строки внутри дня должны упорядочиваться однозначно, иначе
 * страницы внутри дня поедут — то же требование, что и у `readAll`. Для
 * `gsc_daily` это `normalized_url, query`: вместе с датой они образуют
 * первичный ключ, значит внутри дня пара уникальна.
 *
 * Про край. Верхняя граница берётся из самой таблицы, а не из сегодняшнего
 * числа: иначе строка с датой «завтра» (часовые пояса, ручная правка) не
 * попала бы в выдачу и никто бы этого не заметил.
 */
export async function readAllByDay<T = any>(opts: {
  /** Клиент Supabase нужной схемы. */
  client: any
  table: string
  /** Список колонок, как в `select`. Колонку даты запрашивать не обязательно. */
  select: string
  /** Нижняя граница окна, `YYYY-MM-DD`. Без неё читается вся таблица. */
  since?: string
  /** Колонка с датой. */
  dateColumn?: string
  /** Порядок внутри дня. Обязан быть однозначным. */
  order: string[]
  /** Прочие условия — применяются и к чтению, и к поиску края. */
  apply?: (q: Query) => Query
  pageSize?: number
  /** Сколько дней читать одновременно. */
  batch?: number
  label?: string
}): Promise<T[]> {
  const { client, table, select, since, order, apply } = opts
  const dateColumn = opts.dateColumn ?? 'date'
  const pageSize = Math.min(opts.pageSize ?? 1000, 1000)
  const batch = Math.max(1, opts.batch ?? 24)
  const label = opts.label ?? table

  const edge = async (ascending: boolean): Promise<string | null> => {
    let q = client.from(table).select(dateColumn)
    if (apply) q = apply(q)
    if (since) q = q.gte(dateColumn, since)
    const r = await q.order(dateColumn, { ascending }).limit(1)
    if (r.error) throw new Error(`${label}: ${r.error.message}`)
    return r.data?.[0]?.[dateColumn] ?? null
  }

  const [firstDay, lastDay] = await Promise.all([edge(true), edge(false)])
  if (!firstDay || !lastDay) return []

  const days: string[] = []
  for (const d = new Date(`${firstDay}T00:00:00Z`); d <= new Date(`${lastDay}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10))
  }

  const readDay = async (day: string): Promise<T[]> => {
    const rows: T[] = []
    for (let from = 0; ; from += pageSize) {
      let q = client.from(table).select(select)
      if (apply) q = apply(q)
      q = q.eq(dateColumn, day)
      for (const col of order) q = q.order(col, { ascending: true })
      const r = await q.range(from, from + pageSize - 1)
      if (r.error) throw new Error(`${label}: ${r.error.message}`)
      const data = (r.data ?? []) as T[]
      rows.push(...data)
      if (data.length < pageSize) return rows
    }
  }

  const out: T[] = []
  for (let i = 0; i < days.length; i += batch) {
    const chunk = await Promise.all(days.slice(i, i + batch).map(readDay))
    for (const rows of chunk) out.push(...rows)
  }
  return out
}
