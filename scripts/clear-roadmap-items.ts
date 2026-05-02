/**
 * Удалить все пункты внутри стадий roadmap_data, сохранив сами стадии
 * (с их title, month, done). Использовать для теста: куратор уже
 * заполнил шаблоном, но хочет начать с пустых стадий.
 */

import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const CLIENT_ID = Number(process.argv[2] || 61)

async function main() {
  const { data: row } = await sb.from('clients').select('roadmap_data').eq('id', CLIENT_ID).single()
  const raw = row?.roadmap_data as any
  if (!raw || Array.isArray(raw)) {
    console.log('roadmap пуст или старый формат — нечего чистить')
    return
  }
  const stages = (raw.stages || []) as any[]
  const cleaned = { stages: stages.map(s => ({ ...s, items: [] })) }
  await sb.from('clients').update({ roadmap_data: cleaned }).eq('id', CLIENT_ID)
  console.log(`✓ очищено пунктов в ${stages.length} стадиях для клиента #${CLIENT_ID}`)
}
main().catch(e => { console.error(e); process.exit(1) })
