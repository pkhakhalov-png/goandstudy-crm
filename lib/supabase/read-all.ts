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
