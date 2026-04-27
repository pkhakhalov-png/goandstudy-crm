import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SCHOLARSHIPS_SUPABASE_URL!, process.env.NEXT_PUBLIC_SCHOLARSHIPS_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
async function main() {
  const { data } = await sb.from('scholarships_topuni').select('scholarship_id, institution_title, institution_logo_url, institution_logo_url_local').or('institution_title.ilike.%Indian Institute of Science%,institution_title.ilike.%Costello%').eq('archived', false).limit(8)
  data?.forEach(s => {
    console.log(`#${s.scholarship_id} ${s.institution_title}`)
    console.log('  local:', s.institution_logo_url_local || 'NULL')
    console.log('  remote:', s.institution_logo_url || 'NULL')
  })
}
main()
