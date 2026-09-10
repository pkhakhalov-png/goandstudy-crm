import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const IDS = [89, 122, 123, 124, 126, 127]

async function main() {
  const { data: curators } = await db.from('curators').select('id, name')
  const curName = (id: any) => (curators || []).find(c => c.id === id)?.name

  const { data: clients } = await db.from('clients')
    .select('id, name, curator_id').in('id', IDS)

  // ВСЕ расходы-выплаты кураторам по этим клиентам (и пустые, и именные)
  const { data: exp } = await db.from('expenses')
    .select('id, client_id, article, who, plan_date, plan_sum, note')
    .eq('article', 'curator').in('client_id', IDS)
    .order('client_id').order('plan_date')

  console.log('=== Все curator-расходы по 6 клиентам (пустые + именные):\n')
  for (const cid of IDS) {
    const c = (clients || []).find(x => x.id === cid)
    const rows = (exp || []).filter(e => e.client_id === cid)
    console.log(`client_id=${cid}  ${c?.name}  | назначенный куратор клиента: ${curName(c?.curator_id) || '— нет'}`)
    for (const r of rows) console.log(`    ${r.plan_date}  ${r.plan_sum}₽  who=${r.who === null ? 'NULL' : '"'+r.who+'"'}  note="${r.note}"`)
    console.log('')
  }

  // Дополнительно: нет ли ИМЕННЫХ расходов с таким же именем клиента, но на ДРУГОЙ client_id
  const names = (clients || []).map(c => (c.name || '').trim())
  const { data: sameName } = await db.from('clients').select('id, name').in('name', names)
  console.log('=== Клиенты с такими же именами в базе (проверка двойников):')
  for (const nm of [...new Set(names)]) {
    const arr = (sameName || []).filter(c => (c.name || '').trim() === nm)
    console.log(`  "${nm}": ids=[${arr.map(a => a.id).join(', ')}]${arr.length > 1 ? '  <-- НЕСКОЛЬКО' : ''}`)
  }
}
main()
