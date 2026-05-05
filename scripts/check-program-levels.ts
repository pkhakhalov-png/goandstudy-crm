import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!, process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const LEVEL_MAP: Record<string, { raw: string[]; nameKeywords: string[] }> = {
  bachelor: {
    raw: ['bachelors', '3_year_bachelors', 'integrated_masters', 'topup_degree', 'certificate', 'diploma', 'advanced_diploma'],
    nameKeywords: ['bachelor', 'undergrad', 'b.sc', 'b.a.', 'bsc', 'bachelorstudiengang'],
  },
}

async function main() {
  // Точно как делает app/curator/universities/page.tsx
  const levels = ['bachelor']
  const allRaw = new Set<string>()
  const allKw = new Set<string>()
  for (const l of levels) {
    const m = LEVEL_MAP[l]
    if (m) { m.raw.forEach(r => allRaw.add(r)); m.nameKeywords.forEach(k => allKw.add(k)) }
  }
  const orParts: string[] = []
  for (const r of allRaw) orParts.push(`raw_data->attributes->>level.eq.${r}`)
  for (const kw of allKw) orParts.push(`name.ilike.*${kw}*`)
  orParts.push(`raw_data->attributes->>level.is.null`)
  console.log('OR clause length:', orParts.length, 'parts')
  console.log('OR clause:', orParts.join(','))

  const { count, error } = await sb
    .from('programs')
    .select('id, school:schools!inner(country_code)', { count: 'exact', head: true })
    .eq('school.country_code', 'de')
    .eq('specialty_group', 'Право')
    .or(orParts.join(','))
  console.log('\nresult: count=', count, 'error=', error?.message)
}
main()
