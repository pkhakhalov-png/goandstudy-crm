import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const { data: stages } = await sb.from('curator_stages').select('*').order('position')
  console.log('STAGES:')
  for (const s of (stages ?? [])) {
    console.log(`  ${s.position}. id=${s.id?.slice(0,8)} code=${s.code} | "${s.title}" | "${s.subtitle}" | badge=${s.badge}`)
  }
  const { data: cl } = await sb.from('curator_stage_checklist').select('*').order('position')
  console.log(`\nCHECKLIST ITEMS (${cl?.length || 0}):`)
  for (const c of (cl ?? [])) {
    console.log(`  ${c.position}. stage=${c.stage_id?.slice(0,8)} sec=${c.section} text=${c.text?.slice(0,80)}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
