// Сколько стоило старое чтение таблицы в воркере: страницами по 500 строк,
// одна за другой. Нужно для честной колонки «было» в таблице шагов.
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { fetchAll } from '../lib/seo/steps-article'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
}).schema('seo') as any

/** Ровно то, что было в lib/seo/steps-article.ts до правки. */
async function fetchAllOld(table: string, cols: string): Promise<any[]> {
  const out: any[] = []
  let requests = 0
  for (let from = 0; ; from += 500) {
    const { data, error } = await seo.from(table).select(cols).range(from, from + 499)
    requests++
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < 500) break
  }
  console.log(`   походов до базы: ${requests}`)
  return out
}

async function main() {
  console.log('\nЧТЕНИЕ gsc_daily ЦЕЛИКОМ — ЭТО ДЕЛАЮТ article_brief И topics_from_gsc')
  console.log('─'.repeat(72))

  console.log('как было — по 500 строк, последовательно:')
  const t1 = Date.now()
  const old = await fetchAllOld('gsc_daily', 'normalized_url,query,clicks,impressions,position')
  const ms1 = Date.now() - t1
  console.log(`   ${old.length.toLocaleString('ru')} строк за ${(ms1 / 1000).toFixed(1)} с`)

  console.log('как стало — по 1000 строк, пачками параллельно, с порядком:')
  const t2 = Date.now()
  const now = await fetchAll(seo, 'gsc_daily', 'normalized_url,query,clicks,impressions,position')
  const ms2 = Date.now() - t2
  console.log(`   ${now.length.toLocaleString('ru')} строк за ${(ms2 / 1000).toFixed(1)} с`)

  console.log(`быстрее в ${(ms1 / ms2).toFixed(1)} раза`)
  console.log(old.length === now.length ? 'строк прочитано столько же' : `РАСХОЖДЕНИЕ: ${old.length} против ${now.length}`)

  // Порядок важен не сам по себе, а тем, что без него строки могли теряться
  const key = (r: any) => `${r.normalized_url} ${r.query}`
  console.log(`уникальных пар «адрес и запрос»: было ${new Set(old.map(key)).size}, стало ${new Set(now.map(key)).size}`)
  const sum = (a: any[]) => a.reduce((s, r) => s + (r.impressions ?? 0), 0)
  console.log(`сумма показов: было ${sum(old).toLocaleString('ru')}, стало ${sum(now).toLocaleString('ru')}`)
}

main().catch((e) => { console.error('не получилось:', e.message); process.exit(1) })
