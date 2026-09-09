// Прогон стандарта (приложение F) по существующим статьям блога.
// Нужен для калибровки: §16.5 говорит прямо — если живые статьи, написанные редактором,
// массово не проходят порог, неверен порог, а не статьи.
//
//   npx tsx scripts/seo-standard-check.ts            # 10 статей блога
//   npx tsx scripts/seo-standard-check.ts 20         # больше
//   npx tsx scripts/seo-standard-check.ts --url https://goandstudy.com/blog/xxx
import { config } from 'dotenv'; import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { parse } from 'node-html-parser'
import { checkStandard, summarize, type Check } from '../lib/seo/standard'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')

async function main() {
  const one = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : null
  const limit = Number(process.argv[2]) || 10

  const site = await loadSite()
  let urls: string[]
  if (one) urls = [one]
  else {
    const { data } = await seo.from('pages').select('url').ilike('url', '%/blog/%').is('removed_at', null).limit(limit + 5)
    urls = (data ?? []).map((p) => String(p.url)).filter((u) => !u.endsWith('/blog/')).slice(0, limit)
  }

  const tally = new Map<string, { fail: number; level: string }>()
  for (const url of urls) {
    const page = await fetchArticle(url)
    if (!page) { console.log(`✗ ${url} — не удалось разобрать`); continue }
    // Уникальность своих же title/description не проверяем — страница уже на сайте
    const checks = checkStandard({
      html: page.body, h1: page.h1, title: page.title, description: page.description,
      slug: url.replace(/\/$/, '').split('/').pop() ?? '', primaryKeyword: page.h1.split(' ')[0] ?? '',
      knownUrls: site.knownUrls, existingTitles: new Set(), existingDescriptions: new Set(), existingSlugs: new Set(),
    })
    const { failedB, failedW } = summarize(checks)
    console.log(`\n${url.replace('https://goandstudy.com', '')}  — B:${failedB.length} W:${failedW.length}`)
    for (const c of [...failedB, ...failedW]) {
      console.log(`   ${c.level === 'B' ? '✗' : '~'} ${c.id}: ${c.detail}`)
      const t = tally.get(c.id) ?? { fail: 0, level: c.level }
      t.fail++; tally.set(c.id, t)
    }
  }

  console.log(`\n══ Итог по ${urls.length} статьям: какие требования чаще всего валят живой текст ══`)
  for (const [id, t] of [...tally.entries()].sort((a, b) => b[1].fail - a[1].fail)) {
    const share = Math.round((t.fail / urls.length) * 100)
    const flag = t.level === 'B' && share >= 70
      ? '  ← живой текст массово не проходит: либо это новое требование, которого на сайте нет, либо порог неверен (§16.5)'
      : ''
    console.log(`  [${t.level}] ${String(share).padStart(3)}%  ${id}${flag}`)
  }
}

async function fetchArticle(url: string): Promise<{ body: string; h1: string; title: string; description: string } | null> {
  const res = await fetch(url, { headers: { 'User-Agent': 'goandstudy-seo-standard-check' }, signal: AbortSignal.timeout(25000) }).catch(() => null)
  if (!res || !res.ok) return null
  const root = parse(await res.text())
  const container = root.querySelector('article') ?? root.querySelector('.entry-content') ?? root.querySelector('main') ?? root
  const h1 = root.querySelector('h1')?.textContent.trim() ?? ''
  const title = root.querySelector('title')?.textContent.trim() ?? ''
  const description = root.querySelector('meta[name="description"]')?.getAttribute('content') ?? ''
  // H1 в теле мешает проверке 3.1 — она про тело статьи, а не про страницу целиком
  container.querySelectorAll('h1').forEach((h) => h.remove())
  return { body: container.innerHTML, h1, title, description }
}

async function loadSite() {
  const knownUrls = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data } = await seo.from('pages').select('url,normalized_url').range(from, from + 999)
    for (const p of data ?? []) { knownUrls.add(String(p.url).replace(/\/$/, '')); knownUrls.add(String(p.normalized_url).replace(/\/$/, '')) }
    if (!data || data.length < 1000) break
  }
  return { knownUrls }
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
