// Проверка, попала ли страница в индекс.
//
// Google отдаёт настоящий ответ через URL Inspection API — тот же, что показывает
// «Проверка URL» в Search Console. Доступ у нас уже есть: property подключено,
// токен обновляется тем же путём, что и для отчётов.
//
// У Яндекса такого открытого API нет: Webmaster API требует отдельного OAuth-токена.
// Поэтому по Яндексу мы честно показываем факт отправки через IndexNow и дату,
// а не выдаём догадку за проверку.
import { getAccessToken, gscConfigured } from './gsc'

export type IndexVerdict = {
  checked: boolean
  verdict: string          // PASS | NEUTRAL | FAIL | ошибка
  coverageState: string    // «Проиндексировано», «Обнаружено, не проиндексировано» и т.п.
  lastCrawl: string | null
  robotsState: string | null
  canonical: string | null
  note: string
}

const SITE = process.env.GSC_SITE_URL || 'sc-domain:goandstudy.com'

/**
 * Спросить Google про страницу, не гадая с формой адреса.
 *
 * Форма имеет значение: сайт отвечает 301 с адреса без слэша на адрес со слэшем,
 * но в индексе Google держит вариант БЕЗ слэша — и на вариант со слэшем честно
 * отвечает «URL неизвестен». Поэтому спрашиваем сначала форму без слэша (её же
 * использует Search Console в отчётах), а если Google её не знает — пробуем вторую.
 */
export async function inspectPage(url: string): Promise<IndexVerdict & { url: string }> {
  const bare = url.replace(/\/+$/, '')
  const slashed = `${bare}/`

  const first = await inspectUrl(bare)
  if (!first.checked || first.verdict === 'PASS') return { ...first, url: bare }

  const second = await inspectUrl(slashed)
  if (second.checked && second.verdict === 'PASS') return { ...second, url: slashed }
  return { ...first, url: bare }
}

/** Спросить Google про конкретный адрес ровно в той форме, что передали. */
export async function inspectUrl(url: string): Promise<IndexVerdict> {
  if (!gscConfigured()) {
    return { checked: false, verdict: '—', coverageState: '—', lastCrawl: null, robotsState: null, canonical: null,
      note: 'нет доступа к Search Console' }
  }

  const token = await getAccessToken().catch(() => null)
  if (!token) {
    return { checked: false, verdict: '—', coverageState: '—', lastCrawl: null, robotsState: null, canonical: null,
      note: 'не удалось получить токен Search Console' }
  }

  const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: SITE, languageCode: 'ru' }),
    signal: AbortSignal.timeout(30000),
  }).catch(() => null)

  if (!res) {
    return { checked: false, verdict: '—', coverageState: '—', lastCrawl: null, robotsState: null, canonical: null, note: 'сеть недоступна' }
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // Квота у метода жёсткая: 2000 запросов в сутки и 600 в минуту на property
    const note = res.status === 429 ? 'исчерпана суточная квота проверок' : `Search Console ответил ${res.status}: ${body.slice(0, 120)}`
    return { checked: false, verdict: '—', coverageState: '—', lastCrawl: null, robotsState: null, canonical: null, note }
  }

  const data: any = await res.json()
  const r = data?.inspectionResult?.indexStatusResult ?? {}
  return {
    checked: true,
    verdict: r.verdict ?? 'NEUTRAL',
    coverageState: r.coverageState ?? '—',
    lastCrawl: r.lastCrawlTime ?? null,
    robotsState: r.robotsTxtState ?? null,
    canonical: r.googleCanonical ?? null,
    note: humanVerdict(r.verdict, r.coverageState),
  }
}

function humanVerdict(verdict?: string, coverage?: string): string {
  if (verdict === 'PASS') return 'в индексе'
  if (verdict === 'FAIL') return 'не в индексе, есть проблема'
  if (coverage && /Discovered|Crawled/i.test(coverage)) return 'Google знает адрес, но ещё не проиндексировал'
  if (coverage && /not found|404/i.test(coverage)) return 'Google адрес не видел'
  return 'ещё не проиндексировано'
}

/** Сохранить результат проверки, чтобы видеть историю и не дёргать квоту зря. */
export async function saveIndexStatus(seo: any, pageId: number, v: IndexVerdict): Promise<void> {
  if (!v.checked) return
  // Пока страница не в индексе, проверяем чаще: смысл в том, чтобы поймать момент
  const nextDays = v.verdict === 'PASS' ? 14 : 2

  const row: Record<string, unknown> = {
    page_id: pageId,
    coverage_state: v.coverageState,
    verdict: v.verdict,
    last_crawl: v.lastCrawl,
    checked_at: new Date().toISOString(),
    next_check_at: new Date(Date.now() + nextDays * 864e5).toISOString(),
  }

  // Дату попадания в индекс ставим один раз — она отвечает на вопрос
  // «сколько дней страница шла до индекса», и перезаписывать её нельзя
  if (v.verdict === 'PASS') {
    const { data: prev } = await seo.from('index_status')
      .select('first_indexed_at').eq('page_id', pageId).maybeSingle()
    if (!prev?.first_indexed_at) row.first_indexed_at = v.lastCrawl ?? new Date().toISOString()
  }

  const { error } = await seo.from('index_status').upsert(row, { onConflict: 'page_id' })
  // Колонка появляется миграцией; пока её нет, пишем без неё, а не теряем проверку
  if (error && /first_indexed_at/.test(error.message)) {
    delete row.first_indexed_at
    await seo.from('index_status').upsert(row, { onConflict: 'page_id' })
  }
}

/**
 * Обход сайта: спрашиваем Search Console про страницы, чей срок проверки подошёл.
 * Ограничение по числу за раз — чтобы уложиться в бюджет тика и не съесть квоту
 * (2000 адресов в сутки на ресурс, 600 в минуту).
 */
export async function checkSiteIndexation(
  seo: any,
  opts: { limit?: number; onEach?: (url: string, v: IndexVerdict) => void } = {},
): Promise<{ checked: number; stopped?: string }> {
  const limit = opts.limit ?? 60
  const nowIso = new Date().toISOString()

  const { data: pages } = await seo.from('pages')
    .select('id, normalized_url, index_status:index_status(next_check_at)')
    .is('removed_at', null).eq('indexable', true).eq('http_status', 200)
    .order('id')

  // Сначала те, кого не проверяли ни разу, затем просроченные
  const due = (pages ?? [])
    .map((p: any) => ({ ...p, next: p.index_status?.[0]?.next_check_at ?? p.index_status?.next_check_at ?? null }))
    .filter((p: any) => !p.next || p.next <= nowIso)
    .sort((a: any, b: any) => (a.next ? 1 : 0) - (b.next ? 1 : 0))
    .slice(0, limit)

  let checked = 0
  for (const p of due) {
    const v = await inspectPage(p.normalized_url)
    if (!v.checked) return { checked, stopped: v.note } // квота или доступ — дальше нет смысла
    await saveIndexStatus(seo, p.id, v)
    opts.onEach?.(p.normalized_url, v)
    checked++
  }
  return { checked }
}
