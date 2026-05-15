import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  // Найти сделки в РЕЛОКАЦ-этапе
  const { data: stages } = await sb.from('pipeline_stages').select('id, name').ilike('name', '%релокац%')
  console.log('РЕЛОКАЦ этапы:', stages)

  const stageIds = (stages || []).map(s => s.id)
  if (stageIds.length === 0) return

  const { data: deals } = await sb
    .from('deals')
    .select('id, title, contact_name, custom_fields, source, deleted_at, created_at, salesperson_id')
    .in('stage_id', stageIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  console.log(`\nСделки в Релокац: ${deals?.length}\n`)
  for (const d of (deals || [])) {
    const cf = d.custom_fields as any
    console.log(`#${d.id?.slice(0,8)} | "${d.title}"`)
    console.log(`   contact_name=${d.contact_name}`)
    console.log(`   source=${d.source} | sp=${d.salesperson_id?.slice(0,8)} | created=${d.created_at?.slice(0,16)}`)
    console.log(`   custom_fields:`, JSON.stringify(cf))
    console.log()
  }

  // Группировка по contact_name
  const byName: Record<string, any[]> = {}
  for (const d of (deals || [])) {
    const k = d.contact_name || '(null)'
    if (!byName[k]) byName[k] = []
    byName[k].push(d)
  }
  console.log('Группы по contact_name:')
  Object.entries(byName).forEach(([k, arr]) => {
    if (arr.length > 1) console.log(`  "${k}" → ${arr.length} сделок`)
  })
}
main().catch(e => { console.error(e); process.exit(1) })
