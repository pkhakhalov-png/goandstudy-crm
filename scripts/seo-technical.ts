// Прогон технического аудита (порт чеклистов claude-seo) прямо против прод-БД,
// без деплоя воркера. Пишет находки в seo.findings. has_schema считается только
// если применена миграция 20260908000001 (иначе missing_schema пропускается).
import { config } from 'dotenv'; import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { computeTechnicalFindings } from '../lib/seo/findings'
import { safeFetch } from '../lib/seo/safe-fetch'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')

async function main() {
  const counts = await computeTechnicalFindings(seo as any, safeFetch as any, 'https://goandstudy.com')
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  console.log('✓ technical findings:', JSON.stringify(counts), '| всего', total)
}
main().catch((e) => { console.error(e); process.exit(1) })
