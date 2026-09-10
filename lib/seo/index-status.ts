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

/** Спросить Google про конкретный адрес. */
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
  await seo.from('index_status').upsert({
    page_id: pageId,
    coverage_state: v.coverageState,
    verdict: v.verdict,
    last_crawl: v.lastCrawl,
    checked_at: new Date().toISOString(),
    next_check_at: new Date(Date.now() + nextDays * 864e5).toISOString(),
  }, { onConflict: 'page_id' })
}
