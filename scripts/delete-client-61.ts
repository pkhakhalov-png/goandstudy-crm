import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const ID = 61

async function main() {
  const { data: client } = await sb.from('clients').select('id, name, email').eq('id', ID).maybeSingle()
  if (!client) { console.log('клиент не найден'); return }
  console.log('удаляю:', client)

  // Все связанные таблицы
  const tables = [
    'client_applications', 'client_universities', 'client_documents',
    'client_essays', 'client_invitations', 'client_shortlists',
    'client_scholarship_unlocks', 'payments', 'expenses',
    'application_profile_data', 'client_activities', 'client_stages',
    'client_checklist_progress', 'client_tg_messages', 'client_tg_files',
  ]
  for (const t of tables) {
    try {
      const { error } = await sb.from(t).delete().eq('client_id', ID)
      console.log(t, error ? `❌ ${error.message}` : '✓')
    } catch (e) {
      console.log(t, 'skipped')
    }
  }

  // Сделки + cascades
  const { data: deals } = await sb.from('deals').select('id').eq('client_id', ID)
  if (deals?.length) {
    const ids = deals.map(d => d.id)
    for (const t of ['deal_messages', 'deal_files', 'deal_tasks', 'deal_activities']) {
      await sb.from(t).delete().in('deal_id', ids)
    }
    await sb.from('deals').delete().in('id', ids)
    console.log('deals + cascades ✓')
  }

  // Клиент
  const { error: cliErr } = await sb.from('clients').delete().eq('id', ID)
  if (cliErr) console.error('clients:', cliErr.message)
  else console.log('clients ✓')

  // Auth + public.users
  if (client.email) {
    const { data: list } = await sb.auth.admin.listUsers()
    const u = list?.users?.find(x => x.email?.toLowerCase() === client.email!.toLowerCase())
    if (u) {
      await sb.from('users').delete().eq('id', u.id)
      await sb.auth.admin.deleteUser(u.id)
      console.log(`auth+public для ${client.email} ✓`)
    }
  }

  console.log('\n✅ клиент #' + ID + ' удалён полностью')
}
main().catch(e => { console.error(e); process.exit(1) })
