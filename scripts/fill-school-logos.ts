/**
 * Заполняет logo_url для школ без лого через Clearbit Logo API.
 *
 * Логика:
 *   1. Грузим все школы без logo_url с website
 *   2. Извлекаем domain из website
 *   3. HEAD запрос к https://logo.clearbit.com/{domain}
 *      Если 200 → сохраняем URL
 *      Если 404 → пропускаем (Clearbit не нашёл)
 *
 * Запуск:
 *   npx tsx scripts/fill-logos-clearbit.ts        # реальный
 *   npx tsx scripts/fill-logos-clearbit.ts --dry  # только показать что найдётся
 */

import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const isDry = process.argv.includes('--dry')
// --country cn — не гонять по всей базе, когда добрали одну страну
const onlyCountry = process.argv.includes('--country')
  ? process.argv[process.argv.indexOf('--country') + 1]?.toLowerCase()
  : null

const sb = createClient(
  process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!,
  process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

function extractDomain(url: string): string | null {
  if (!url) return null
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url)
    let host = u.hostname.toLowerCase()
    if (host.startsWith('www.')) host = host.slice(4)
    return host || null
  } catch {
    // Maybe just a domain string
    const m = url.toLowerCase().replace(/^www\./, '').match(/^([a-z0-9.-]+\.[a-z]{2,})/)
    return m?.[1] || null
  }
}

async function tryDdg(host: string): Promise<string | null> {
  const url = `https://icons.duckduckgo.com/ip3/${host}.ico`
  try {
    const res = await fetch(url, { method: 'GET' })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('image')) return null
    // Размер читаем из тела, а не из Content-Length. Для части хостов DDG
    // отдаёт иконку chunked, без заголовка длины — и проверка на «> 200»
    // отбраковывала живые 4-килобайтные значки (напр. www.shnu.edu.cn).
    const bytes = (await res.arrayBuffer()).byteLength
    return bytes > 200 ? url : null
  } catch { return null }
}

async function findLogo(domain: string, fullHost?: string | null): Promise<string | null> {
  // Пробуем и «голый» домен, и хост как он записан на сайте вуза: у shnu.edu.cn
  // иконки нет, а у www.shnu.edu.cn есть — DDG индексирует их раздельно.
  const hosts = [...new Set([domain, fullHost].filter(Boolean) as string[])]

  // 1) DuckDuckGo Icon API
  for (const h of hosts) {
    const hit = await tryDdg(h)
    if (hit) return hit
  }

  // 2) Google s2/favicons — fallback (всегда возвращает что-то, даже generic)
  for (const h of hosts) {
    const googleUrl = `https://www.google.com/s2/favicons?domain=${h}&sz=128`
    try {
      const res = await fetch(googleUrl, { method: 'GET', redirect: 'follow' })
      if (!res.ok) continue
      const ct = res.headers.get('content-type') || ''
      // Google всегда возвращает PNG, даже generic
      if (ct.startsWith('image/')) return googleUrl
    } catch { /* skip */ }
  }

  return null
}

/** Хост как он записан в website, без обрезки www — второй кандидат для DDG. */
function rawHost(url: string): string | null {
  try { return new URL(url.startsWith('http') ? url : 'https://' + url).hostname.toLowerCase() || null }
  catch { return null }
}

async function main() {
  console.log(`mode: ${isDry ? 'DRY' : 'REAL'}`)

  // Подгружаем все школы
  const all: any[] = []
  for (let off = 0; off < 10000; off += 1000) {
    const { data } = await sb.from('schools').select('id, name, website, logo_url, country_code').range(off, off + 999)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
  }
  const need = all
    .filter(s => !s.logo_url && s.website)
    .filter(s => !onlyCountry || (s.country_code || '').toLowerCase() === onlyCountry)
  console.log(`schools without logo (with website)${onlyCountry ? `, country=${onlyCountry}` : ''}: ${need.length}`)

  let found = 0, skipped = 0, errored = 0, processed = 0

  // Обрабатываем по 10 параллельно (Clearbit бесплатный, но не злоупотребляем)
  const CONCURRENCY = 10
  const queue = [...need]
  const workers: Promise<void>[] = []

  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const s = queue.shift()
        if (!s) break
        const domain = extractDomain(s.website)
        processed++
        if (!domain) { skipped++; continue }
        const logoUrl = await findLogo(domain, rawHost(s.website))
        if (!logoUrl) { skipped++; continue }
        if (!isDry) {
          const { error } = await sb.from('schools').update({ logo_url: logoUrl }).eq('id', s.id)
          if (error) { errored++; continue }
        }
        found++
        if (found % 50 === 0 || processed % 100 === 0) {
          console.log(`  progress: ${processed}/${need.length} · found ${found} · skipped ${skipped}`)
        }
      }
    })())
  }
  await Promise.all(workers)

  console.log(`\n✅ done: processed ${processed}, found ${found}, skipped ${skipped}, errored ${errored}`)
}

main().catch(e => { console.error(e); process.exit(1) })
