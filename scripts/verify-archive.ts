import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const IDS = [37,47,94,107,116,51,52,102]
async function main() {
  const { data: cl } = await sb.from('clients').select('id, name, status').in('id', IDS).order('id')
  console.log('=== статусы клиентов ===')
  for (const c of cl ?? []) console.log(`  ${c.id} | ${c.name} | ${c.status}`)
  const { data: arch } = await sb.from('client_archive').select('client_id, archived_at, original_status').in('client_id', IDS).order('client_id')
  console.log(`\n=== снапшоты в client_archive: ${arch?.length}/8 ===`)
  for (const a of arch ?? []) console.log(`  ${a.client_id} | было: ${a.original_status} | ${a.archived_at}`)
  // остались ли неоплаченные у архивных
  const { data: leftPay } = await sb.from('payments').select('id').in('client_id', IDS).eq('is_paid', false)
  const { data: leftExp } = await sb.from('expenses').select('id').in('client_id', IDS).eq('is_paid', false)
  console.log(`\nОстаток неоплаченных у архивных: платежей ${leftPay?.length ?? 0}, расходов ${leftExp?.length ?? 0} (должно быть 0)`)
}
main().catch(e=>{console.error(e);process.exit(1)})
