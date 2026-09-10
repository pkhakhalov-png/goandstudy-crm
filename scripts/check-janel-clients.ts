import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const JANEL = '532db56c-b7de-4003-9fb4-80bcd483d160'
async function main() {
  const { data: cur } = await sb.from('curators').select('id, name, user_id, is_active').eq('id', JANEL).single()
  console.log('Куратор Жанель:', JSON.stringify(cur))
  const { data: cl } = await sb.from('clients').select('id, name, status, curator_id, curator_assigned_at, current_stage_code').eq('curator_id', JANEL).order('id')
  console.log(`\nКлиентов с curator_id=Жанель: ${cl?.length ?? 0}`)
  for (const c of cl ?? []) console.log(`  id=${c.id} | ${c.name} | status=${c.status} | stage=${c.current_stage_code || '—'} | assigned=${c.curator_assigned_at || '—'}`)
  // на всякий — где сейчас Соколов 117
  const { data: sok } = await sb.from('clients').select('id, name, status, curator_id').eq('id', 117).single()
  console.log('\nСоколов (117):', JSON.stringify(sok))
}
main().catch(e=>{console.error(e);process.exit(1)})
