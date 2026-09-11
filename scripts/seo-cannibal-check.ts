// Проверка тем на каннибализацию по семьям запросов.
// Запуск: npx tsx scripts/seo-cannibal-check.ts
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { checkCannibalization } from '../lib/seo/cannibal'

const MARK = {
  safe: '✓ можно',
  update: '✗ обновлять существующую',
  risky: '⚠ уже дерутся',
  unclear: '? на рассмотрение',
} as const

async function main() {
  const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).schema('seo')
  const { data: topics } = await seo.from('topics')
    .select('id, title, primary_keyword, search_volume')
    .eq('status', 'new').eq('origin', 'gsc_gap')
    .order('priority', { ascending: false, nullsFirst: false }).limit(Number(process.argv[2] ?? 15))

  for (const t of topics ?? []) {
    const q = t.primary_keyword ?? t.title
    const v = await checkCannibalization(seo, q)
    if (v.caveat) console.log()
    console.log(`\n${MARK[v.verdict]}  «${q}»  · ${t.search_volume ?? 0} показов`)
    console.log(`   ${v.reason}`)
    if (v.owners.length) {
      for (const o of v.owners.slice(0, 3))
        console.log(`     ${String(Math.round(o.share * 100)).padStart(3)}%  ${String(o.impressions).padStart(5)}п  поз ${o.position.toFixed(1).padStart(5)}  ${o.url.replace('https://goandstudy.com', '')}`)
    }
  }
}
main().catch((e) => { console.error('✗', e.message); process.exit(1) })
