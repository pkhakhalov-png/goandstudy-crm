// Проверка индексации всего сайта через Search Console.
// Запуск: npx tsx scripts/seo-index-site.ts [сколько]
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { checkSiteIndexation } from '../lib/seo/index-status'

async function main() {
  const limit = Number(process.argv[2] ?? 200)
  const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).schema('seo')
  const tally: Record<string, number> = {}

  const res = await checkSiteIndexation(seo, {
    limit,
    onEach: (url, v) => {
      tally[v.note] = (tally[v.note] ?? 0) + 1
      if (v.verdict !== 'PASS') console.log(`  ${v.note.padEnd(42)} ${url.replace('https://goandstudy.com', '') || '/'}`)
    },
  })

  console.log(`\nпроверено: ${res.checked}${res.stopped ? ` (остановились: ${res.stopped})` : ''}`)
  for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`)
}
main().catch((e) => { console.error('✗', e.message); process.exit(1) })
