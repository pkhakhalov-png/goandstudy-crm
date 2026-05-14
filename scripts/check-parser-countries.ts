import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const PARSER_URL = process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!
const PARSER_KEY = process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!

if (!PARSER_URL || !PARSER_KEY) {
  console.error('Need PARSER_SUPABASE_URL and PARSER_SUPABASE_KEY in .env.local')
  console.log('Available env keys:', Object.keys(process.env).filter(k => /PARSER|SUPABASE/.test(k)))
  process.exit(1)
}

const parser = createClient(PARSER_URL, PARSER_KEY, { auth: { persistSession: false } })

async function main() {
  // 1. Total programs
  const { count: totalProg } = await parser.from('programs').select('id', { count: 'exact', head: true })
  console.log(`Total programs: ${totalProg}`)

  // 2. Total schools
  const { count: totalSch } = await parser.from('schools').select('id', { count: 'exact', head: true })
  console.log(`Total schools:  ${totalSch}\n`)

  // 3. Country codes in schools (all variants)
  const { data: schools } = await parser.from('schools').select('country_code').limit(10000)
  const countryFreq: Record<string, number> = {}
  for (const s of (schools || [])) {
    const cc = s.country_code || '(null)'
    countryFreq[cc] = (countryFreq[cc] || 0) + 1
  }
  console.log('Schools by country_code (top 30, first 10k schools):')
  Object.entries(countryFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .forEach(([k, v]) => console.log(`  ${k.padEnd(10)} ${v}`))

  // 4. Test the exact query that runs in client page
  console.log('\nTest country counts via programs+inner join (что использует ClientWorkspace):')
  const CODES = ['us', 'gb', 'ca', 'de', 'fr', 'it', 'es', 'nl', 'at', 'au', 'ie', 'ae', 'hu']
  for (const c of CODES) {
    const r = await parser.from('programs')
      .select('id, school:schools!inner(country_code)', { count: 'exact', head: true })
      .eq('school.country_code', c)
    console.log(`  ${c.padEnd(4)} → ${r.count || 0}  ${r.error ? 'ERR ' + r.error.message : ''}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
