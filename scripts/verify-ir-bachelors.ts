import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const parser = createClient(process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!, process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const SCHOOLS = [5045,4387,4376,5055,4320,5410,5411,5412,5413]
async function main() {
  for (const sid of SCHOOLS) {
    const { data } = await parser.rpc('search_programs', { p_school_id: sid, p_specialty: null, p_levels: ['bachelor'], p_limit: 24, p_offset: 0, p_count_cap: null })
    const rows = ((data as any)?.rows ?? []).filter((r:any)=> r.source === 'curator_gh')
    console.log(`school ${sid}: bachelor total=${(data as any)?.total}, наши(curator_gh)=${rows.length} → ${rows.map((r:any)=>r.name).join(' | ') || '—'}`)
  }
}
main().catch(e=>{console.error(e);process.exit(1)})
