/**
 * Read-only: сколько школ/программ в parser DB по запрошенным странам куратора.
 *   npx tsx scripts/check-country-coverage.ts
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const parser = createClient(
  process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!,
  process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// запрошенные куратором + уже поддержанные для сравнения
const REQUESTED: Record<string, string> = {
  si: 'Словения', pt: 'Португалия', tr: 'Турция',
  gr: 'Греция', sk: 'Словакия', dk: 'Дания', be: 'Бельгия',
}
const EXISTING = ['us', 'gb', 'ca', 'de', 'fr', 'it', 'es', 'nl', 'at', 'au', 'ie', 'ae', 'hu']

async function main() {
  console.log('=== Запрошенные куратором страны ===')
  for (const [cc, ru] of Object.entries(REQUESTED)) {
    const { data: schools } = await parser.from('schools').select('id').eq('country_code', cc).limit(10000)
    const ids = (schools || []).map((s: any) => s.id)
    let progCount = 0
    if (ids.length) {
      const { count } = await parser.from('programs').select('id', { count: 'exact', head: true }).in('school_id', ids)
      progCount = count || 0
    }
    console.log(`  ${cc}  ${ru.padEnd(12)} школ: ${String(ids.length).padStart(4)}   программ: ${progCount}`)
  }

  console.log('\n=== Уже поддержанные (для сравнения) ===')
  for (const cc of EXISTING) {
    const { data: schools } = await parser.from('schools').select('id').eq('country_code', cc).limit(10000)
    const ids = (schools || []).map((s: any) => s.id)
    let progCount = 0
    if (ids.length) {
      const { count } = await parser.from('programs').select('id', { count: 'exact', head: true }).in('school_id', ids)
      progCount = count || 0
    }
    console.log(`  ${cc}  школ: ${String(ids.length).padStart(4)}   программ: ${progCount}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
