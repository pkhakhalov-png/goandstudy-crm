import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
async function main() {
  const { data: sales } = await sb.from('users').select('id, name, email, role, is_active').eq('role', 'salesperson')
  console.log(`\n=== Продажники (role=salesperson): ${sales?.length ?? 0} ===`)
  for (const u of sales ?? []) console.log(`  ${u.id} · ${u.name} · ${u.email} · is_active=${u.is_active}`)
  const activeIds = new Set((sales ?? []).filter(u => u.is_active).map(u => u.id))
  console.log(`  активных (is_active=true): ${activeIds.size}`)

  const { data: slots } = await sb.from('schedule_slots').select('user_id, day_of_week, start_time, end_time, is_active')
  console.log(`\n=== schedule_slots всего: ${slots?.length ?? 0} ===`)
  const active = (slots ?? []).filter(s => s.is_active)
  console.log(`  is_active=true: ${active.length}`)
  const byUser = new Map<string, number>()
  for (const s of active) byUser.set(s.user_id, (byUser.get(s.user_id) || 0) + 1)
  for (const [uid, n] of byUser) {
    const inActive = activeIds.has(uid)
    const who = (sales ?? []).find(u => u.id === uid)
    console.log(`  user ${uid} (${who?.name ?? '???'}) → ${n} активных слотов · продажник активен=${inActive} · в users есть=${!!who}`)
  }
  // дни недели покрытия
  const dows = new Set(active.filter(s => activeIds.has(s.user_id)).map(s => s.day_of_week))
  console.log(`\n  дни недели с валидными слотами (активный слот + активный продажник): [${[...dows].sort().join(', ')}]`)
}
main().catch(e => { console.error(e); process.exit(1) })
