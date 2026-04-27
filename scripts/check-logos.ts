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
  const { data } = await sb
    .from('scholarships_topuni')
    .select('scholarship_id, title, institution_title, institution_logo_url, institution_logo_url_local')
    .eq('archived', false)
    .order('scholarship_id')
    .limit(15)

  console.log('First 15 scholarships:\n')
  data?.forEach(s => {
    const local = s.institution_logo_url_local
    const remote = s.institution_logo_url
    console.log(`#${s.scholarship_id} ${s.institution_title}`)
    console.log(`  local:  ${local || '—'}`)
    console.log(`  remote: ${remote || '—'}`)
  })

  // Stats
  const { count: total } = await sb.from('scholarships_topuni').select('*', { count: 'exact', head: true }).eq('archived', false)
  const { count: withLocal } = await sb.from('scholarships_topuni').select('*', { count: 'exact', head: true }).eq('archived', false).not('institution_logo_url_local', 'is', null)
  const { count: withRemote } = await sb.from('scholarships_topuni').select('*', { count: 'exact', head: true }).eq('archived', false).not('institution_logo_url', 'is', null)
  console.log(`\nTotal active: ${total}`)
  console.log(`With local logo:  ${withLocal}`)
  console.log(`With remote logo: ${withRemote}`)
}
main().catch(e => { console.error(e); process.exit(1) })
