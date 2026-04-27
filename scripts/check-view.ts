import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SCHOLARSHIPS_SUPABASE_URL!, process.env.NEXT_PUBLIC_SCHOLARSHIPS_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
async function main() {
  const { data, error } = await sb.from('v_scholarships_active').select('scholarship_id, institution_title, institution_logo_url, institution_logo_url_local').limit(3)
  if (error) console.log('ERR:', error.message)
  data?.forEach(s => {
    console.log(`#${s.scholarship_id} ${s.institution_title}`)
    console.log('  local:', s.institution_logo_url_local || '!!! NULL !!!')
    console.log('  remote:', s.institution_logo_url || 'NULL')
  })
}
main()
