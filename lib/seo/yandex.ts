/**
 * Яндекс.Вебмастер: индексация, переобход и запросы.
 *
 * Зачем отдельно от Google. Мы уведомляем Яндекс через IndexNow, но уведомление
 * — не индексация: приняли адрес и приняли к сведению это разные вещи. Проверить
 * состояние можно только у самого Яндекса.
 *
 * И главное отличие от Google: Яндекс принимает заявку на переобход страницы.
 * У Google такого нет вовсе — там остаётся только ждать. Здесь можно попросить,
 * в пределах суточной квоты.
 */

const API = 'https://api.webmaster.yandex.net/v4'

export function yandexConfigured(): boolean {
  return !!process.env.YANDEX_TOKEN
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.YANDEX_TOKEN
  if (!token) throw new Error('нет YANDEX_TOKEN')

  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `OAuth ${token}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(30000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Вебмастер ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

/** Идентификатор пользователя — с него начинается любой запрос к API. */
export async function userId(): Promise<number> {
  const r = await call<{ user_id: number }>('/user/')
  return r.user_id
}

/**
 * Идентификатор сайта. Яндекс хранит его в своём формате
 * (`https:goandstudy.com:443`), и угадывать его не стоит — спрашиваем.
 */
export async function hostId(domain = 'goandstudy.com'): Promise<string> {
  const uid = await userId()
  const r = await call<{ hosts: { host_id: string; ascii_host_url: string; verified: boolean }[] }>(`/user/${uid}/hosts/`)
  const host = r.hosts.find((h) => h.ascii_host_url.includes(domain))
  if (!host) throw new Error(`сайт ${domain} не найден в Вебмастере (доступно: ${r.hosts.map((h) => h.ascii_host_url).join(', ')})`)
  if (!host.verified) throw new Error(`сайт ${domain} в Вебмастере не подтверждён`)
  return host.host_id
}

export type YandexIndexState = {
  url: string
  /** Страница присутствует в поиске Яндекса. */
  inSearch: boolean | null
  /** Когда Яндекс последний раз заходил. */
  lastAccess: string | null
  /** Что он о ней думает: сюда попадает его же формулировка. */
  status: string | null
  note: string
}

/**
 * Состояние конкретной страницы.
 *
 * Яндекс не даёт проверку одного адреса так же прямо, как Google: смотрим
 * список страниц в поиске и ищем там свою. Поэтому ответ «нет в списке» значит
 * «не нашли среди присланных», а не «точно не в индексе» — и формулировка
 * должна это отражать.
 */
export type InSearchSample = { lastAccess: string | null; status: string | null }

/**
 * Страницы, которые Яндекс отдаёт как присутствующие в поиске.
 *
 * Это выборка, а не полный список: Яндекс не обязуется отдать всё. Поэтому
 * «нет в этом списке» значит «не нашли среди присланного», и называть это
 * «не в индексе» нельзя — мы бы врали пользователю.
 */
export async function inSearchSamples(host?: string, max = 1000): Promise<Map<string, InSearchSample>> {
  const hid = host ?? (await hostId())
  const uid = await userId()
  const out = new Map<string, InSearchSample>()

  for (let offset = 0; offset < max; offset += 100) {
    const r = await call<{ samples: { url: string; last_access?: string; status?: string }[] }>(
      `/user/${uid}/hosts/${encodeURIComponent(hid)}/search-urls/in-search/samples/?limit=100&offset=${offset}`,
    ).catch(() => null)
    if (!r?.samples?.length) break
    for (const s of r.samples) {
      out.set(s.url.replace(/\/$/, ''), { lastAccess: s.last_access ?? null, status: s.status ?? null })
    }
    if (r.samples.length < 100) break
  }
  return out
}

/** Сколько страниц Яндекс держит в поиске — число, а не выборка. */
export async function inSearchCount(host?: string): Promise<{ count: number | null; date: string | null }> {
  const hid = host ?? (await hostId())
  const uid = await userId()
  const r = await call<{ history: { date: string; value: number }[] }>(
    `/user/${uid}/hosts/${encodeURIComponent(hid)}/search-urls/in-search/history/`,
  ).catch(() => null)
  const last = r?.history?.[r.history.length - 1]
  return { count: last?.value ?? null, date: last?.date ?? null }
}

export async function checkUrls(urls: string[], host?: string): Promise<YandexIndexState[]> {
  const out: YandexIndexState[] = []
  const inSearch = await inSearchSamples(host)

  for (const url of urls) {
    const found = inSearch.get(url.replace(/\/$/, ''))
    out.push({
      url,
      inSearch: found ? true : null,
      lastAccess: found?.lastAccess ?? null,
      status: found?.status ?? null,
      note: found
        ? 'в поиске Яндекса'
        : 'среди присланных Яндексом страниц не найдена — это не то же самое, что «не в индексе»',
    })
  }
  return out
}

/** Сколько заявок на переобход осталось на сегодня. */
export async function recrawlQuota(host?: string): Promise<{ used: number; total: number }> {
  const hid = host ?? (await hostId())
  const r = await call<{ daily_quota: number; quota_remainder: number }>(
    `/user/${await userId()}/hosts/${encodeURIComponent(hid)}/recrawl/quota/`,
  )
  return { used: r.daily_quota - r.quota_remainder, total: r.daily_quota }
}

/**
 * Попросить переобойти страницу.
 *
 * Это не «проиндексировать немедленно», а «посмотри сюда раньше обычного».
 * Квота маленькая, поэтому тратим её только на то, что действительно
 * изменилось: новую статью и обновлённую, а не на всё подряд.
 */
export async function requestRecrawl(url: string, host?: string): Promise<{ taskId?: string; error?: string }> {
  try {
    const hid = host ?? (await hostId())
    const r = await call<{ task_id: string }>(
      `/user/${await userId()}/hosts/${encodeURIComponent(hid)}/recrawl/queue/`,
      { method: 'POST', body: JSON.stringify({ url }) },
    )
    return { taskId: r.task_id }
  } catch (e: any) {
    return { error: String(e?.message ?? e) }
  }
}

export type YandexQuery = { query: string; impressions: number; clicks: number; position: number | null }

/** Популярные запросы сайта за неделю — яндексовый близнец Search Console. */
export async function popularQueries(host?: string, limit = 500): Promise<YandexQuery[]> {
  const hid = host ?? (await hostId())
  const r = await call<{ queries: { query_text: string; indicators: Record<string, number> }[] }>(
    `/user/${await userId()}/hosts/${encodeURIComponent(hid)}/search-queries/popular/`
      + `?order_by=TOTAL_SHOWS&query_indicator=TOTAL_SHOWS&query_indicator=TOTAL_CLICKS&query_indicator=AVG_SHOW_POSITION&limit=${limit}`,
  )
  return (r.queries ?? []).map((q) => ({
    query: q.query_text,
    impressions: q.indicators?.TOTAL_SHOWS ?? 0,
    clicks: q.indicators?.TOTAL_CLICKS ?? 0,
    position: q.indicators?.AVG_SHOW_POSITION ?? null,
  }))
}
