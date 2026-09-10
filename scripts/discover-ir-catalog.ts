import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const parser = createClient(process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!, process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const CANDIDATES = [
  'Bologna', 'Pécs', 'Pecs', 'Corvinus', 'Macerata', 'Vilnius', 'European Humanities', 'Jagiellonian', 'Masaryk', 'Central European',
]

async function main() {
  // taxonomy
  const { data: progs } = await parser.from('programs').select('specialty_group, degree_text').limit(5000)
  const sg = new Map<string, number>(); const dg = new Map<string, number>()
  for (const p of progs ?? []) {
    if (p.specialty_group) sg.set(p.specialty_group, (sg.get(p.specialty_group)||0)+1)
    if (p.degree_text) dg.set(p.degree_text, (dg.get(p.degree_text)||0)+1)
  }
  console.log('=== specialty_group (по убыванию) ===')
  for (const [k,v] of [...sg.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  ${v}\t${k}`)
  console.log('\n=== degree_text ===')
  for (const [k,v] of [...dg.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  ${v}\t${k}`)

  // sample bachelor row (все колонки)
  const { data: sample } = await parser.from('programs').select('*').ilike('degree_text','%bach%').limit(1)
  if (!sample?.length) { const { data: s2 } = await parser.from('programs').select('*').limit(1); console.log('\n=== program columns ===\n', Object.keys(s2?.[0]||{}).join(', ')) }
  else console.log('\n=== program columns ===\n', Object.keys(sample[0]).join(', '))

  // school matches
  console.log('\n=== СОВПАДЕНИЯ ВУЗОВ ===')
  for (const term of CANDIDATES) {
    const { data: hits } = await parser.from('schools').select('id, name, city, country_code').ilike('name', `%${term}%`)
    console.log(`\n🔎 "${term}": ${hits?.length ? '' : 'нет'}`)
    for (const h of hits ?? []) console.log(`   id=${h.id} | ${h.name} | ${h.city||'—'} | ${h.country_code||'—'}`)
  }
}
main().catch(e=>{console.error(e);process.exit(1)})
