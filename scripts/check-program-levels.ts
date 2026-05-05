/**
 * Диагностика каталога программ:
 *   1. Счётчики по source (applyboard / daad / curator_gh / null)
 *   2. Прогресс заполнения start_date_text + deadline_text у applyboard
 *      (чтобы видеть как идёт бэкфилл).
 */

import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!,
  process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

async function main() {
  console.log('=== Programs by source ===')
  const sources: (string | null)[] = ['applyboard', 'daad', 'curator_gh', null]
  for (const src of sources) {
    const q = sb.from('programs').select('id', { count: 'exact', head: true })
    const r = src ? await q.eq('source', src) : await q.is('source', null)
    console.log(`  source=${src ?? '(null)'}: ${r.count ?? 0}`)
  }
  const { count: grandTotal } = await sb.from('programs').select('id', { count: 'exact', head: true })
  console.log(`  TOTAL: ${grandTotal ?? 0}`)

  console.log('\n=== applyboard backfill progress ===')
  const { count: abTotal } = await sb
    .from('programs').select('id', { count: 'exact', head: true })
    .eq('source', 'applyboard')
  const { count: withStart } = await sb
    .from('programs').select('id', { count: 'exact', head: true })
    .eq('source', 'applyboard').not('start_date_text', 'is', null)
  const { count: withDeadline } = await sb
    .from('programs').select('id', { count: 'exact', head: true })
    .eq('source', 'applyboard').not('deadline_text', 'is', null)
  const pct = abTotal ? Math.round((withStart || 0) * 100 / abTotal) : 0
  console.log(`  start_date_text: ${withStart}/${abTotal} (${pct}%)`)
  console.log(`  deadline_text:   ${withDeadline}/${abTotal}`)
}

main().catch(e => { console.error(e); process.exit(1) })
