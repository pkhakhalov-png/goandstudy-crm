// Ре-краул всех известных страниц (заполняет has_schema/schema_types и обновляет
// метаданные) прямо против прод-БД. Конкурентность ограничена, чтобы не долбить сайт.
import { config } from 'dotenv'; import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { crawlPage } from '../lib/seo/crawl'
import { normalizeUrl } from '../lib/seo/normalize'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')

async function main() {
  const urls: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await seo.from('pages').select('normalized_url').is('removed_at', null).range(from, from + 999)
    for (const p of data ?? []) urls.push(p.normalized_url)
    if (!data || data.length < 1000) break
  }
  console.log('страниц к ре-краулу:', urls.length)

  const CONC = 6
  let ok = 0, fail = 0, done = 0
  for (let i = 0; i < urls.length; i += CONC) {
    const batch = urls.slice(i, i + CONC)
    await Promise.all(batch.map(async (u) => {
      const r = await crawlPage(seo as any, u, normalizeUrl).catch((e) => ({ ok: false, reason: e.message }))
      r.ok ? ok++ : fail++
      done++
    }))
    if (done % 30 === 0 || done === urls.length) console.log(`  ${done}/${urls.length} (ok ${ok}, fail ${fail})`)
  }

  // сколько теперь со схемой
  const withSchema = await seo.from('pages').select('id', { count: 'exact', head: true }).eq('has_schema', true)
  const noSchema = await seo.from('pages').select('id', { count: 'exact', head: true }).eq('has_schema', false)
  console.log(`✓ ре-краул завершён. has_schema=true: ${withSchema.count}, has_schema=false: ${noSchema.count}`)
}
main().catch((e) => { console.error(e.message || e); process.exit(1) })
