import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const { data: curators } = await db.from('curators').select('id, name')
  const curName = (id: any) => (curators || []).find(c => c.id === id)?.name || null

  // Все curator-расходы без имени
  const { data: exp } = await db.from('expenses')
    .select('id, client_id, who, plan_sum, note')
    .eq('article', 'curator').is('who', null)

  if (!exp || exp.length === 0) { console.log('Нет пустых curator-расходов — нечего делать.'); return }

  const clientIds = [...new Set(exp.map(e => e.client_id))]
  const { data: clients } = await db.from('clients').select('id, name, curator_id').in('id', clientIds)

  let updated = 0, skipped = 0
  for (const e of exp) {
    const c = (clients || []).find(x => x.id === e.client_id)
    const name = curName(c?.curator_id)
    if (!name) {
      console.log(`  SKIP  ${c?.name} (expense#${e.id}) — у клиента нет curator_id`)
      skipped++
      continue
    }
    const { error } = await db.from('expenses').update({ who: name }).eq('id', e.id)
    if (error) { console.log(`  ERR   ${c?.name} (expense#${e.id}):`, error.message); continue }
    console.log(`  OK    ${c?.name}  ${e.plan_sum}₽  who -> "${name}"`)
    updated++
  }
  console.log(`\nИтого: обновлено ${updated}, пропущено ${skipped}`)
}
main()
