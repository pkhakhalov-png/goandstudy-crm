import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const PARSER_URL = process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!
const PARSER_KEY = process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!
const sb = createClient(PARSER_URL, PARSER_KEY, { auth: { persistSession: false } })

async function main() {
  console.log('=== Filter data quality by source ===')
  for (const src of ['applyboard', 'daad', 'curator_gh']) {
    const { data: programs } = await sb
      .from('programs')
      .select('id, name, source, specialty_group, tuition, raw_data, school:schools!inner(country_code, university_type)')
      .eq('source', src)
      .limit(500)
    const total = programs?.length || 0
    let withSpecialty = 0, withTuition = 0, withLevel = 0, withIntake = 0, withUniType = 0
    const sampleNames: string[] = []
    for (const p of programs || []) {
      if (p.specialty_group) withSpecialty++
      if (p.tuition !== null && p.tuition !== undefined) withTuition++
      if ((p.raw_data as any)?.attributes?.level) withLevel++
      if ((p.raw_data as any)?.attributes?.earliest_intake?.start_date) withIntake++
      if ((p.school as any)?.university_type) withUniType++
      if (sampleNames.length < 5) sampleNames.push(p.name)
    }
    console.log(`\n  ${src} (${total} sample):`)
    console.log(`    specialty_group: ${withSpecialty}/${total}`)
    console.log(`    tuition:         ${withTuition}/${total}`)
    console.log(`    level (jsonb):   ${withLevel}/${total}`)
    console.log(`    intake (jsonb):  ${withIntake}/${total}`)
    console.log(`    university_type: ${withUniType}/${total}`)
    console.log(`    sample names:    ${sampleNames.slice(0, 3).map(n => `"${n}"`).join(', ')}`)
  }
}
main()
