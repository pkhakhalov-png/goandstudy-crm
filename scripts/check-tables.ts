import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!,
    process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Возьмём какой-нибудь школьный id
  const { data: school } = await sb.from('schools').select('id').limit(1).single()
  const sid = school!.id

  // Test 1: запрос по school_id (FK index должен сработать)
  let t = Date.now()
  await sb.from('programs').select('id', { count: 'exact', head: true }).eq('school_id', sid)
  console.log(`school_id=${sid} (FK index):           ${Date.now() - t}ms`)

  // Test 2: запрос по source
  t = Date.now()
  await sb.from('programs').select('id', { count: 'exact', head: true }).eq('source', 'applyboard')
  console.log(`source=applyboard:                       ${Date.now() - t}ms`)

  // Test 3: ILIKE (trigram GIN index)
  t = Date.now()
  await sb.from('programs').select('id', { count: 'exact', head: true }).ilike('name', '%computer%')
  console.log(`ILIKE %computer% (trigram):              ${Date.now() - t}ms`)

  // Test 4: JSONB level expression index
  t = Date.now()
  await sb.from('programs').select('id', { count: 'exact', head: true }).eq('raw_data->attributes->>level', 'bachelors')
  console.log(`level=bachelors (JSONB expression):     ${Date.now() - t}ms`)

  // Test 5: country через embedded join
  t = Date.now()
  await sb.from('programs').select('id, school:schools!inner(country_code)', { count: 'exact', head: true }).eq('school.country_code', 'de')
  console.log(`country=de (embedded join):              ${Date.now() - t}ms`)

  // Test 6: реальный hot-path фильтра каталога
  t = Date.now()
  await sb.from('programs').select('id, school:schools!inner(country_code)', { count: 'exact', head: true })
    .eq('school.country_code', 'de')
    .or([
      'raw_data->attributes->>level.eq.bachelors',
      'raw_data->attributes->>level.eq.3_year_bachelors',
      'name.ilike.*bachelor*',
      'raw_data->attributes->>level.is.null',
    ].join(','))
  console.log(`hot-path DE+bachelor (как UI):           ${Date.now() - t}ms`)
}
main()
