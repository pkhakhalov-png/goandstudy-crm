import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const devEnv = {} as Record<string, string>
config({ path: path.resolve(process.cwd(), '.env.development.local'), processEnv: devEnv })
const prodEnv = {} as Record<string, string>
config({ path: path.resolve(process.cwd(), '.env.local'), processEnv: prodEnv })

const DEV_URL = devEnv.NEXT_PUBLIC_SUPABASE_URL
const DEV_KEY = devEnv.SUPABASE_SERVICE_ROLE_KEY
const PROD_URL = prodEnv.NEXT_PUBLIC_SUPABASE_URL
const PROD_KEY = prodEnv.SUPABASE_SERVICE_ROLE_KEY

if (!DEV_URL || !DEV_KEY || !PROD_URL || !PROD_KEY) {
  console.error('Missing env vars'); process.exit(1)
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const dev = createClient(DEV_URL, DEV_KEY, opts)
const prod = createClient(PROD_URL, PROD_KEY, opts)

async function main() {
  console.log(`DEV  → ${DEV_URL}`)
  console.log(`PROD → ${PROD_URL}\n`)

  // 1. Забираем этапы из dev
  const { data: devStages, error: ds } = await dev
    .from('curator_stages')
    .select('id, code, title, subtitle, position, is_optional, badge, description')
    .order('position')
  if (ds) { console.error('dev stages:', ds.message); process.exit(1) }

  const { data: devChecks, error: dc } = await dev
    .from('curator_stage_checklist')
    .select('id, stage_id, text, position, external_link, section')
    .order('position')
  if (dc) { console.error('dev checklist:', dc.message); process.exit(1) }

  console.log(`✓ dev: ${devStages?.length} этапов, ${devChecks?.length} пунктов чеклиста`)

  // 2. Забираем текущие этапы prod (нужны их UUID, сопоставляем по code)
  const { data: prodStages, error: ps } = await prod
    .from('curator_stages')
    .select('id, code')
  if (ps) { console.error('prod stages:', ps.message); process.exit(1) }

  const prodIdByCode = new Map<string, string>()
  prodStages?.forEach(s => prodIdByCode.set(s.code, s.id))
  console.log(`✓ prod: ${prodStages?.length} этапов\n`)

  // 3. Обновляем/вставляем этапы на prod (по code)
  let updated = 0, inserted = 0
  for (const s of devStages ?? []) {
    const existingId = prodIdByCode.get(s.code)
    const payload = {
      title: s.title, subtitle: s.subtitle, position: s.position,
      is_optional: s.is_optional, badge: s.badge, description: s.description,
    }
    if (existingId) {
      const { error } = await prod.from('curator_stages').update(payload).eq('id', existingId)
      if (error) { console.error(`update ${s.code}:`, error.message); process.exit(1) }
      updated++
    } else {
      const { data, error } = await prod.from('curator_stages')
        .insert({ ...payload, code: s.code }).select('id').single()
      if (error) { console.error(`insert ${s.code}:`, error.message); process.exit(1) }
      prodIdByCode.set(s.code, data.id)
      inserted++
    }
  }
  console.log(`✓ этапы: обновлено ${updated}, добавлено ${inserted}`)

  // 4. Удаляем этапы на prod, которых нет в dev
  const devCodes = new Set((devStages ?? []).map(s => s.code))
  const toDelete = (prodStages ?? []).filter(s => !devCodes.has(s.code))
  for (const s of toDelete) {
    const { error } = await prod.from('curator_stages').delete().eq('id', s.id)
    if (error) { console.warn(`skip delete ${s.code}: ${error.message}`) }
    else console.log(`   - удалён этап ${s.code} (был лишним)`)
  }

  // 5. Маппим dev stage UUID → prod stage UUID
  const devIdToCode = new Map<string, string>()
  devStages?.forEach(s => devIdToCode.set(s.id, s.code))

  // 6. Чистим чеклисты на prod и вставляем из dev с правильными stage_id
  const { error: delC } = await prod.from('curator_stage_checklist').delete().not('id', 'is', null)
  if (delC) { console.error('delete checklists:', delC.message); process.exit(1) }
  console.log('\n✓ чеклист очищен на проде')

  const rows = (devChecks ?? []).map(c => {
    const code = devIdToCode.get(c.stage_id)
    const newStageId = code ? prodIdByCode.get(code) : null
    return newStageId ? {
      stage_id: newStageId,
      text: c.text,
      position: c.position,
      external_link: c.external_link,
      section: c.section,
    } : null
  }).filter(Boolean) as any[]

  if (rows.length) {
    const { error } = await prod.from('curator_stage_checklist').insert(rows)
    if (error) { console.error('insert checklist:', error.message); process.exit(1) }
    console.log(`✓ вставлено ${rows.length} пунктов чеклиста`)
  }

  console.log('\n✅ Этапы и чеклисты синхронизированы прод = дев')
}

main().catch(e => { console.error(e); process.exit(1) })
