import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
async function main() {
  const { data: users } = await sb.from('users').select('id, name')
  const umap = new Map((users ?? []).map(u => [u.id, u.name]))
  const { data: cl } = await sb.from('clients')
    .select('id, name, status, salesperson_id, created_at')
    .gte('created_at', '2026-08-01').lt('created_at', '2026-09-01')
    .order('created_at')
  const all = cl ?? []
  const real = all.filter(c => !/тест|test/i.test(c.name))
  const withSales = real.filter(c => c.salesperson_id)
  console.log(`Заведено в августе 2026: ${all.length} всего | ${real.length} без тестовых | ${withSales.length} с продажником\n`)
  console.log('=== СПИСОК (без тестовых) ===')
  real.forEach((c, i) => {
    const d = new Date(c.created_at).toLocaleDateString('ru-RU')
    console.log(`${String(i+1).padStart(2)}. ${c.name}  —  продажник: ${c.salesperson_id ? (umap.get(c.salesperson_id)||'?') : '—'} | ${d} | ${c.status}`)
  })
}
main().catch(e=>{console.error(e);process.exit(1)})
