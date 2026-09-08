// TS-нормализатор URL (пара к seo.normalize_url в Postgres, правила PRD 7.1.1).
// Должен давать тот же результат, что и SQL-версия.
const DROP = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'yclid', '_ga', 'ref'])

export function normalizeUrl(raw: string, stripQuery = false): string {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return raw }

  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  let path = u.pathname || '/'
  // trailing slash кроме корня
  if (path !== '/') path = path.replace(/\/+$/, '')
  if (path === '') path = '/'

  let query = ''
  if (!stripQuery && u.search) {
    const params = [...u.searchParams.entries()]
      .filter(([k]) => k && !DROP.has(k.toLowerCase()))
      .map(([k, v]) => `${k}=${v}`)
      .sort()
    if (params.length) query = '?' + params.join('&')
  }
  return `https://${host}${path}${query}`
}
