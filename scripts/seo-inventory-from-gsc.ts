// Добор инвентаря по данным Search Console.
//
// Инвентарь строился по sitemap.xml, а sitemap на goandstudy.com неполный: часть живых
// страниц в нём нет, и модуль их просто не видел. Этот скрипт берёт URL, по которым
// Google показывает сайт в выдаче, и краулит те, которых нет в seo.pages.
//
//   npx tsx scripts/seo-inventory-from-gsc.ts           # показать, чего не хватает
//   npx tsx scripts/seo-inventory-from-gsc.ts --apply   # добрать в инвентарь
import { config } from 'dotenv'; import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { crawlPage } from '../lib/seo/crawl'
import { normalizeUrl } from '../lib/seo/normalize'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')
const APPLY = process.argv.includes('--apply')

async function main() {
  const known = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await seo.from('pages').select('normalized_url').range(from, from + 999)
    if (error) throw new Error(`pages: ${error.message}`)
    for (const p of data ?? []) known.add(String(p.normalized_url).replace(/\/$/, ''))
    if (!data || data.length < 1000) break
  }

  const traffic = new Map<string, number>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await seo.from('gsc_page_daily').select('normalized_url,impressions').range(from, from + 999)
    if (error) throw new Error(`gsc_page_daily: ${error.message}`)
    for (const r of data ?? []) {
      const u = String(r.normalized_url).replace(/\/$/, '')
      traffic.set(u, (traffic.get(u) ?? 0) + (r.impressions ?? 0))
    }
    if (!data || data.length < 1000) break
  }

  const missing = [...traffic.entries()].filter(([u]) => !known.has(u)).sort((a, b) => b[1] - a[1])
  const impressions = missing.reduce((s, [, i]) => s + i, 0)
  console.log(`В инвентаре ${known.size} страниц. В GSC ${traffic.size} страниц с показами.`)
  console.log(`Не хватает ${missing.length} страниц — на них ${impressions.toLocaleString('ru')} показов.\n`)
  for (const [u, imp] of missing.slice(0, 20)) console.log(`  ${String(imp).padStart(7)} показ.  ${u}`)
  if (missing.length > 20) console.log(`  … ещё ${missing.length - 20}`)

  if (!APPLY) { console.log('\nСухой прогон. Чтобы добрать в инвентарь: --apply'); return }

  console.log('\nКраулю…')
  const CONC = 5
  let ok = 0, fail = 0
  const urls = missing.map(([u]) => u)
  for (let i = 0; i < urls.length; i += CONC) {
    await Promise.all(urls.slice(i, i + CONC).map(async (u) => {
      const r: any = await crawlPage(seo as any, u, normalizeUrl).catch((e) => ({ ok: false, reason: e.message }))
      if (r?.ok === false) { fail++; console.log(`  ✗ ${u} — ${r.reason ?? 'ошибка'}`) } else ok++
    }))
    process.stdout.write(`\r  ${Math.min(i + CONC, urls.length)}/${urls.length}`)
  }
  console.log(`\n\nДобавлено: ${ok}, ошибок: ${fail}`)
  console.log('Дальше нужно пересчитать: seo-embed.ts → seo-cluster.ts → seo-run-findings.ts / seo-gsc-findings.ts')
}
main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
