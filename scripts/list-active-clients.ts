import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const { data, error } = await sb.from('clients')
    .select('id, name, country, status, curator_id, created_at, email, phone')
    .order('id', { ascending: true })
  if (error) { console.error(error); return }
  const all = data ?? []
  const isTest = (c: any) => {
    const s = `${c.name || ''} ${c.email || ''}`.toLowerCase()
    return s.includes('тест') || s.includes('test') || s.includes('демо') || s.includes('demo')
  }
  const real = all.filter(c => !isTest(c))
  const test = all.filter(c => isTest(c))
  console.log(`Всего клиентов: ${all.length}`)
  console.log(`Тестовых: ${test.length}`)
  console.log(`Реальных: ${real.length}`)
  console.log()
  console.log('=== Тестовые (исключены) ===')
  for (const c of test) {
    console.log(`  #${c.id} · ${c.name} · ${c.email || '—'} · status=${c.status}`)
  }
  console.log()
  console.log('=== Реальные клиенты ===')
  const byStatus = new Map<string, any[]>()
  for (const c of real) {
    const k = c.status || '—'
    if (!byStatus.has(k)) byStatus.set(k, [])
    byStatus.get(k)!.push(c)
  }
  for (const [status, list] of byStatus) {
    console.log(`\n--- status: ${status} (${list.length}) ---`)
    for (const c of list) {
      console.log(`  #${c.id} · ${c.name} · ${c.country || '—'} · ${c.email || '—'} · curator=${c.curator_id || '—'}`)
    }
  }
}
main().catch(console.error)
