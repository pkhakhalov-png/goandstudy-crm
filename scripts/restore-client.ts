/**
 * Восстановить клиента из архива: npx tsx scripts/restore-client.ts <id> [--confirm]
 */
import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
import { warnOnError } from '../lib/supabase/write-guard'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const CONFIRM = process.argv.includes('--confirm')
const ID = Number(process.argv.find(a => /^\d+$/.test(a)))
async function main() {
  if (!ID) { console.error('Укажи id: npx tsx scripts/restore-client.ts 94 --confirm'); process.exit(1) }
  const { data: snap } = await sb.from('client_archive').select('*').eq('client_id', ID).maybeSingle()
  if (!snap) { console.error(`Снапшота для client_id=${ID} нет`); process.exit(1) }
  const pays = snap.payments_json as any[]; const exps = snap.expenses_json as any[]
  console.log(`Восстановление id=${ID}: платежей ${pays.length}, расходов ${exps.length}, статус → ${snap.original_status}`)
  if (!CONFIRM) { console.log('⚠️ dry-run. Запусти с --confirm.'); return }
  await sb.from('payments').delete().eq('client_id', ID).then(warnOnError('payments · scripts/restore-client.ts:16'))
  await sb.from('expenses').delete().eq('client_id', ID).then(warnOnError('expenses · scripts/restore-client.ts:17'))
  if (pays.length) { const { error } = await sb.from('payments').insert(pays); if (error) { console.error('pay insert err:', error.message); process.exit(1) } }
  if (exps.length) { const { error } = await sb.from('expenses').insert(exps); if (error) { console.error('exp insert err:', error.message); process.exit(1) } }
  const { error: eSt } = await sb.from('clients').update({ status: snap.original_status || 'active' }).eq('id', ID)
  if (eSt) { console.error('status err:', eSt.message); process.exit(1) }
  await sb.from('client_archive').delete().eq('client_id', ID).then(warnOnError('client_archive · scripts/restore-client.ts:22'))
  console.log('✅ Восстановлено.')
}
main().catch(e => { console.error(e); process.exit(1) })
