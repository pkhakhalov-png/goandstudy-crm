import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

// ВАЖНО: используем ANON ключ — как делает страница в проде (createParserClient)
const sb = createClient(
  process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_PARSER_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
)

async function main() {
  console.log('=== ANON: DE без фильтров ===')
  const { count: c0, error: e0 } = await sb
    .from('programs')
    .select('id, school:schools!inner(country_code)', { count: 'exact', head: true })
    .eq('school.country_code', 'de')
  console.log(`count=${c0} error=${e0?.message}`)

  console.log('\n=== ANON: DE + level OR (как на проде) ===')
  const orParts = [
    'raw_data->attributes->>level.eq.bachelors',
    'raw_data->attributes->>level.eq.3_year_bachelors',
    'raw_data->attributes->>level.eq.integrated_masters',
    'raw_data->attributes->>level.eq.topup_degree',
    'raw_data->attributes->>level.eq.certificate',
    'raw_data->attributes->>level.eq.diploma',
    'raw_data->attributes->>level.eq.advanced_diploma',
    'name.ilike.*bachelor*',
    'name.ilike.*undergrad*',
    'name.ilike.*b.sc*',
    'name.ilike.*b.a.*',
    'name.ilike.*bsc*',
    'name.ilike.*bachelorstudiengang*',
    'raw_data->attributes->>level.is.null',
  ]
  const { count: c1, error: e1 } = await sb
    .from('programs')
    .select('id, school:schools!inner(country_code)', { count: 'exact', head: true })
    .eq('school.country_code', 'de')
    .or(orParts.join(','))
  console.log(`count=${c1} error=${e1?.message}`)
}
main()
