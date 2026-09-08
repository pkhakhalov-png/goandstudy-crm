// Безопасное скачивание внешнего контента (PRD 11.4).
// URL предлагает LLM → fetch(произвольный_url) недопустим. Защита от SSRF:
// блок приватных диапазонов, проверка IP до и после (rebinding), только http(s),
// редиректы ≤3 с проверкой каждого хопа, MIME html/pdf/plain, лимит 5 MB, таймаут 20 с.
import dns from 'node:dns/promises'

const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 20_000
const MAX_REDIRECTS = 3
const ALLOWED_MIME = ['text/html', 'application/pdf', 'text/plain', 'application/xhtml+xml', 'application/xml', 'text/xml']

export type SafeFetchResult =
  | { ok: true; status: number; finalUrl: string; contentType: string; body: Buffer }
  | { ok: false; reason: string; status?: number }

function ipToBytes(ip: string): number[] | null {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return null
  const b = m.slice(1).map(Number)
  return b.every((x) => x >= 0 && x <= 255) ? b : null
}

export function isPrivateIp(ip: string): boolean {
  // IPv4
  const b = ipToBytes(ip)
  if (b) {
    const [a, c] = b
    if (a === 10) return true
    if (a === 127) return true
    if (a === 0) return true
    if (a === 172 && c >= 16 && c <= 31) return true
    if (a === 192 && c === 168) return true
    if (a === 169 && c === 254) return true          // link-local + metadata 169.254.169.254
    if (a === 100 && c >= 64 && c <= 127) return true // CGNAT
    if (a >= 224) return true                          // multicast/reserved
    return false
  }
  // IPv6 (базовая проверка)
  const v = ip.toLowerCase()
  if (v === '::1' || v === '::') return true
  if (v.startsWith('fe80')) return true               // link-local
  if (v.startsWith('fc') || v.startsWith('fd')) return true // unique-local
  if (v.startsWith('::ffff:')) {                       // IPv4-mapped
    const mapped = v.split(':').pop() || ''
    if (mapped.includes('.')) return isPrivateIp(mapped)
  }
  return false
}

async function hostResolvesSafe(host: string): Promise<{ safe: boolean; ips: string[] }> {
  // числовой хост
  if (ipToBytes(host) || host.includes(':')) {
    return { safe: !isPrivateIp(host), ips: [host] }
  }
  let records: { address: string }[]
  try {
    records = await dns.lookup(host, { all: true })
  } catch {
    return { safe: false, ips: [] }
  }
  const ips = records.map((r) => r.address)
  return { safe: ips.length > 0 && ips.every((ip) => !isPrivateIp(ip)), ips }
}

export async function safeFetch(rawUrl: string, userAgent = 'goandstudy-seo-bot'): Promise<SafeFetchResult> {
  let current = rawUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let u: URL
    try { u = new URL(current) } catch { return { ok: false, reason: 'invalid url' } }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, reason: `blocked protocol ${u.protocol}` }
    }
    // проверка IP ДО запроса
    const pre = await hostResolvesSafe(u.hostname)
    if (!pre.safe) return { ok: false, reason: `blocked host ${u.hostname}` }

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(u.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'User-Agent': userAgent, Accept: ALLOWED_MIME.join(',') },
      })
    } catch (e: any) {
      clearTimeout(timer)
      return { ok: false, reason: `fetch failed: ${e?.message ?? 'error'}` }
    }
    clearTimeout(timer)

    // редирект — проверяем следующий хоп заново
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return { ok: false, reason: 'redirect without location', status: res.status }
      current = new URL(loc, u).toString()
      continue
    }

    // проверка IP ПОСЛЕ (rebinding): повторный резолв должен совпадать по безопасности
    const post = await hostResolvesSafe(u.hostname)
    if (!post.safe) return { ok: false, reason: 'dns rebinding suspected' }

    if (!res.ok) return { ok: false, reason: `http ${res.status}`, status: res.status }

    const ct = (res.headers.get('content-type') || '').toLowerCase()
    if (!ALLOWED_MIME.some((m) => ct.includes(m))) {
      return { ok: false, reason: `blocked mime ${ct}`, status: res.status }
    }
    const declared = Number(res.headers.get('content-length') || '0')
    if (declared > MAX_BYTES) return { ok: false, reason: 'too large', status: res.status }

    // читаем с лимитом размера
    const reader = res.body?.getReader()
    if (!reader) return { ok: false, reason: 'no body' }
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > MAX_BYTES) { reader.cancel(); return { ok: false, reason: 'too large (stream)' } }
      chunks.push(value)
    }
    return { ok: true, status: res.status, finalUrl: u.toString(), contentType: ct, body: Buffer.concat(chunks) }
  }
  return { ok: false, reason: 'too many redirects' }
}
