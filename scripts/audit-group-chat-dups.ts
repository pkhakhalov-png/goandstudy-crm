import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  // Дубли по group_chat_id
  const { data: dups, error } = await sb.rpc('find_duplicate_group_chats')
  if (error && error.code !== '42883' && error.code !== 'PGRST202') { console.error(error); process.exit(1) }

  if (!error && dups && Array.isArray(dups)) {
    console.log(`\nДубли по group_chat_id: ${dups.length}`)
    for (const r of dups.slice(0, 50)) {
      console.log(`  chat=${r.chat_id} → ${r.deal_count} сделок`)
      console.log(`    ids: ${(r.deal_ids || []).join(', ')}`)
    }
    return
  }

  // RPC ещё не существует — делаем вручную
  console.log('RPC find_duplicate_group_chats не найден — считаем вручную через select')
  const { data: deals } = await sb
    .from('deals')
    .select('id, title, custom_fields, source, deleted_at, created_at, salesperson_id')
    .is('deleted_at', null)
  if (!deals) { console.log('нет deals'); return }

  const groups: Record<string, any[]> = {}
  for (const d of deals) {
    const cf = d.custom_fields as any
    const cid = cf?.group_chat_id
    if (!cid) continue
    const key = String(cid)
    if (!groups[key]) groups[key] = []
    groups[key].push(d)
  }
  const dupGroups = Object.entries(groups).filter(([, arr]) => arr.length > 1)
  console.log(`\nДублей групп: ${dupGroups.length}\n`)
  for (const [key, arr] of dupGroups) {
    console.log(`chat=${key} → ${arr.length} сделок:`)
    for (const d of arr) {
      console.log(`  #${d.id?.slice(0,8)} | source=${d.source} | sp=${d.salesperson_id?.slice(0,8)} | title=${d.title?.slice(0,60)} | ${d.created_at?.slice(0,10)}`)
    }
    console.log()
  }
}
main().catch(e => { console.error(e); process.exit(1) })
