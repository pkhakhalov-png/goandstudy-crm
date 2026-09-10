import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const ID = 47
const CONFIRM = process.argv.includes('--confirm')

async function main() {
  const { data: client } = await sb.from('clients').select('*').eq('id', ID).maybeSingle()
  if (!client) { console.error(`Client #${ID} не найден`); process.exit(1) }
  console.log(`Клиент: #${client.id} · ${client.name} · status=${client.status}`)
  console.log(`Email: ${client.email || '—'}`)
  console.log()

  // distinct статусы в БД, чтобы понять что валидно
  const { data: statuses } = await sb.from('clients').select('status')
  const set = new Set((statuses ?? []).map((r: any) => r.status).filter(Boolean))
  console.log(`Существующие статусы в БД: ${[...set].join(', ')}`)
  console.log()

  const { data: payments } = await sb.from('payments').select('*').eq('client_id', ID)
  console.log(`--- Платежи (${payments?.length ?? 0}) ---`)
  for (const p of payments ?? []) {
    console.log(`  #${p.id} · ${p.amount} · ${p.created_at || p.date || ''}`)
  }
  console.log()

  const { data: expenses } = await sb.from('expenses').select('*').eq('client_id', ID)
  console.log(`--- Расходы (${expenses?.length ?? 0}) ---`)
  for (const e of expenses ?? []) {
    console.log(`  #${e.id} · ${e.amount} · ${e.description || ''} · ${e.created_at || e.date || ''}`)
  }
  console.log()

  if (!CONFIRM) {
    console.log('⚠️  План:')
    console.log(`   1. DELETE FROM payments WHERE client_id=${ID}  (${payments?.length ?? 0})`)
    console.log(`   2. DELETE FROM expenses WHERE client_id=${ID}  (${expenses?.length ?? 0})`)
    console.log(`   3. UPDATE clients SET status='refunded' WHERE id=${ID}`)
    console.log(`\nЗапусти с --confirm чтобы выполнить.`)
    return
  }

  console.log('--- ВЫПОЛНЕНИЕ ---')
  if (payments?.length) {
    const { error } = await sb.from('payments').delete().eq('client_id', ID)
    console.log(`  payments deleted: ${payments.length}${error ? ` (ERR: ${error.message})` : ''}`)
  }
  if (expenses?.length) {
    const { error } = await sb.from('expenses').delete().eq('client_id', ID)
    console.log(`  expenses deleted: ${expenses.length}${error ? ` (ERR: ${error.message})` : ''}`)
  }
  const { error: uErr } = await sb.from('clients').update({ status: 'refunded' }).eq('id', ID)
  console.log(`  clients.status='refunded'${uErr ? ` (ERR: ${uErr.message})` : ''}`)
  console.log('\n✅ Готово.')
}
main().catch(e => { console.error(e); process.exit(1) })
