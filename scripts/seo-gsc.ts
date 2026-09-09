// Импорт Google Search Console (клики/показы/позиции) прямо против прод-БД,
// без деплоя воркера. Читает GSC_* из .env.local. Пишет seo.gsc_page_daily / gsc_daily.
import { config } from 'dotenv'; import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { runStep } from '../lib/seo/steps'
import { gscConfigured } from '../lib/seo/gsc'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')

async function main() {
  if (!gscConfigured()) {
    console.error('✗ Нет GSC_* в .env.local (нужны GSC_SITE_URL, GSC_CLIENT_ID, GSC_CLIENT_SECRET, GSC_REFRESH_TOKEN)')
    process.exit(1)
  }
  const startDate = process.argv[2]   // опц. YYYY-MM-DD
  const endDate = process.argv[3]
  const job: any = { id: 0, step: 'gsc_import', lane: 'gsc', payload: { ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) } }
  const res = await runStep(job, seo as any)
  console.log('gsc_import →', JSON.stringify(res.result))
}
main().catch((e) => { console.error(e.message || e); process.exit(1) })
