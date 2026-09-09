// Пересчёт очереди возможностей (PRD §7) в seo.opportunities против прод-БД.
import { config } from 'dotenv'; import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { persistOpportunities } from '../lib/seo/opportunities'
const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')
async function main() {
  const res = await persistOpportunities(seo as any)
  console.log(`✓ возможности: вставлено ${res.inserted}, сохранено решённых ${res.kept}`)
}
main().catch((e) => { console.error(e.message || e); process.exit(1) })
