import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

async function main() {
  console.log('\n=== TEST CLIENTS (name содержит «тест» или «test») ===')
  const { data: testClients } = await sb.from('clients').select('id, name, email, salesperson_id, curator_id, status')
  const filtered = (testClients || []).filter(c =>
    /тест|test/i.test(c.name || '') || /test|test-client/i.test(c.email || '')
  )
  filtered.forEach(c => console.log(`  #${c.id} | ${c.name} | ${c.email} | sp=${c.salesperson_id?.slice(0,8)} | cur=${c.curator_id?.slice(0,8)} | ${c.status}`))

  console.log('\n=== TEST SALESPEOPLE ===')
  const { data: testSp } = await sb.from('users').select('id, email, name, role').eq('role', 'salesperson')
  testSp?.forEach(u => console.log(`  ${u.id.slice(0,8)} | ${u.email} | ${u.name}`))

  console.log('\n=== TEST CURATORS ===')
  const { data: curators } = await sb.from('curators').select('id, name, email, user_id')
  curators?.forEach(c => console.log(`  ${c.id.slice(0,8)} | ${c.name} | ${c.email} | user=${c.user_id ? 'YES' : 'NO'}`))

  console.log('\n=== ADMIN USERS ===')
  const { data: admins } = await sb.from('users').select('id, email, name, role').eq('role', 'admin')
  admins?.forEach(u => console.log(`  ${u.id.slice(0,8)} | ${u.email} | ${u.name}`))

  console.log('\n=== ВСЕ КЛИЕНТЫ (для общей картины) ===')
  console.log(`  Всего: ${testClients?.length || 0}`)
  const byStatus: Record<string, number> = {}
  testClients?.forEach(c => { byStatus[c.status || '?'] = (byStatus[c.status || '?'] || 0) + 1 })
  Object.entries(byStatus).forEach(([s, n]) => console.log(`  ${s}: ${n}`))
}
main().catch(e => { console.error(e); process.exit(1) })
