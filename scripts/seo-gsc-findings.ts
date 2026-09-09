// GSC-находки (striking-distance / CTR / каннибализация) прямо против прод-БД.
// Требует уже импортированных данных GSC (scripts/seo-gsc.ts).
import { config } from 'dotenv'; import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { computeGscFindings } from '../lib/seo/findings'
const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')
async function main() {
  const counts = await computeGscFindings(seo as any)
  console.log('✓ GSC findings:', JSON.stringify(counts))
}
main().catch((e) => { console.error(e.message || e); process.exit(1) })
