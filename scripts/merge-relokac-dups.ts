import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

// Список названий-дублей: оставляем supergroup-чат (с tg_chat_id начинающимся на -100), удаляем group-чат
const TITLES = [
  'Релокац х Петр / учеба 14.05.2026',
  'Релокац х Сергей / Учеба 14.05.2026',
  'Релокац х Мурад / Учеба 14.05.2026',
]

async function main() {
  for (const title of TITLES) {
    const { data: rows } = await sb.from('deals')
      .select('id, custom_fields, created_at')
      .eq('contact_name', title)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
    if (!rows || rows.length < 2) {
      console.log(`✕ "${title}": found ${rows?.length || 0} — пропускаем`)
      continue
    }

    // supergroup = тот у которого tg_chat_id начинается на -100
    let keepRow: any = null
    let removeRow: any = null
    for (const r of rows) {
      const cid = String((r.custom_fields as any)?.tg_chat_id || '')
      if (cid.startsWith('-100')) keepRow = r
      else removeRow = r
    }
    if (!keepRow || !removeRow) {
      console.log(`✕ "${title}": не нашёл supergroup/group пару:`, rows.map(r => (r.custom_fields as any)?.tg_chat_id))
      continue
    }

    console.log(`\n${title}`)
    console.log(`  keep:   ${keepRow.id} | ${(keepRow.custom_fields as any)?.tg_chat_id}`)
    console.log(`  remove: ${removeRow.id} | ${(removeRow.custom_fields as any)?.tg_chat_id}`)

    const { error } = await sb.rpc('merge_deals', {
      keep_id: keepRow.id,
      remove_ids: [removeRow.id],
    })
    if (error) {
      console.error(`  ✕ merge_deals: ${error.message}`)
      continue
    }
    console.log(`  ✓ merged`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
