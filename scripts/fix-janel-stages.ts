import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const JANEL = '532db56c-b7de-4003-9fb4-80bcd483d160'
const NEED_STAGE = [33, 56, 117] // активные клиенты Жанель без стадии
async function main() {
  const before = await sb.from('clients').select('id, name, status, current_stage_code').in('id', NEED_STAGE).order('id')
  console.log('=== ДО ==='); for (const c of before.data ?? []) console.log(`  ${c.id} | ${c.name} | ${c.status} | stage=${c.current_stage_code||'—'}`)

  const r = await sb.from('clients').update({ current_stage_code: 'strategy' }).in('id', NEED_STAGE).is('current_stage_code', null)
  if (r.error) { console.error('err:', r.error.message); process.exit(1) }

  const after = await sb.from('clients').select('id, name, status, current_stage_code').eq('curator_id', JANEL).eq('status','active').order('id')
  console.log('\n=== ПОСЛЕ: активные клиенты Жанель ===')
  for (const c of after.data ?? []) console.log(`  ${c.id} | ${c.name} | stage=${c.current_stage_code||'—'}`)
  console.log(`\nАктивных со стадией (видны на дашборде): ${(after.data ?? []).filter(c=>c.current_stage_code).length} из ${after.data?.length}`)
}
main().catch(e=>{console.error(e);process.exit(1)})
