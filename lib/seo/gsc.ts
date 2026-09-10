// M2: клиент Google Search Console (Search Analytics API).
// OAuth refresh → access token → запросы. Активируется env: GSC_CLIENT_ID/SECRET/REFRESH_TOKEN/SITE_URL.

export function gscConfigured(): boolean {
  return !!(process.env.GSC_CLIENT_ID && process.env.GSC_CLIENT_SECRET && process.env.GSC_REFRESH_TOKEN && process.env.GSC_SITE_URL)
}

// Токен живёт час. Просить новый на каждый запрос нельзя: Google ограничивает
// частоту обмена refresh-токена и на обходе сайта отвечает отказом на середине.
let cachedToken: { value: string; until: number } | null = null

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.until) return cachedToken.value

  const body = new URLSearchParams({
    client_id: process.env.GSC_CLIENT_ID!,
    client_secret: process.env.GSC_CLIENT_SECRET!,
    refresh_token: process.env.GSC_REFRESH_TOKEN!,
    grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`GSC token ${res.status}: ${(await res.text()).slice(0, 200)}`)

  const json = await res.json()
  const ttl = Number(json.expires_in ?? 3600)
  cachedToken = { value: json.access_token, until: Date.now() + (ttl - 120) * 1000 }
  return cachedToken.value
}

export type GscRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }

/** Один запрос Search Analytics (одна страница результатов). */
export async function searchAnalytics(token: string, params: {
  startDate: string; endDate: string; dimensions: string[]; rowLimit?: number; startRow?: number
}): Promise<GscRow[]> {
  const site = encodeURIComponent(process.env.GSC_SITE_URL!)
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate: params.startDate, endDate: params.endDate, dimensions: params.dimensions,
      rowLimit: params.rowLimit ?? 25000, startRow: params.startRow ?? 0, dataState: 'final',
    }),
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`GSC query ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return ((await res.json()).rows ?? []) as GscRow[]
}

// YYYY-MM-DD за N дней назад (UTC)
export function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86400_000)
  return d.toISOString().slice(0, 10)
}
