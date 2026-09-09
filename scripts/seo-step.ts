// Запуск одного шага пайплайна локально, без задеплоенного воркера.
//   npx tsx scripts/seo-step.ts embed_pages         # шаг повторяется, пока есть работа
//   npx tsx scripts/seo-step.ts findings_gsc
// Шаги: inventory_sitemap, crawl_page, embed_pages, gsc_import, findings_inventory,
//       findings_gsc, cluster_pages, topics_from_gaps, generate_schema,
//       compute_opportunities, technical_findings, check_missing_links
import { config } from 'dotenv'; import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { runStep } from '../lib/seo/steps'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')

async function main() {
  const step = process.argv[2]
  if (!step) { console.error('Укажи шаг, например: npx tsx scripts/seo-step.ts embed_pages'); process.exit(1) }
  const payload = process.argv[3] ? JSON.parse(process.argv[3]) : {}

  for (let pass = 1; pass <= 50; pass++) {
    const job: any = { id: 0, step, lane: 'local', payload, run_id: null, run_item_id: null, article_id: null, topic_id: null }
    const res = await runStep(job, seo as any)
    console.log(`${step} #${pass} → ${res.outcome} ${JSON.stringify(res.result ?? {})}`)
    if (res.outcome !== 'done') break
    // Шаг сам сообщает, осталась ли работа (embed_pages идёт партиями)
    const more = (res.result as any)?.more
    if (!more) break
  }
}
main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
