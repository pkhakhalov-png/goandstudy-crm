// Кандидаты статей из content_gap (ссылки в никуда → темы) против прод-БД.
import { config } from 'dotenv'; import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { topicsFromContentGaps } from '../lib/seo/topics'
const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')
async function main() {
  const res = await topicsFromContentGaps(seo as any)
  console.log(`✓ темы из content_gap: создано ${res.created}, дублей ${res.duplicates}, пропущено ${res.skipped}`)
}
main().catch((e) => { console.error(e.message || e); process.exit(1) })
