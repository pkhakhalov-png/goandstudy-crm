import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SCHOLARSHIPS_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SCHOLARSHIPS_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

async function main() {
  console.log('env:', process.env.NEXT_PUBLIC_SCHOLARSHIPS_SUPABASE_URL)
  const { data, count, error } = await sb
    .from('v_scholarships_active')
    .select('scholarship_id, title, institution_title, deadline', { count: 'exact' })
    .order('deadline', { ascending: true, nullsFirst: false })
    .limit(5)
  if (error) {
    console.error('❌', error.message)
    process.exit(1)
  }
  console.log(`✅ v_scholarships_active: ${count} active rows`)
  data?.forEach(s => console.log(' ', s.scholarship_id, '|', s.title, '|', s.institution_title, '|', s.deadline))
}
main().catch(e => { console.error(e); process.exit(1) })
