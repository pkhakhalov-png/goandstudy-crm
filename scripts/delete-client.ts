/**
 * Удалить клиента полностью: storage, все связанные таблицы, public.users, auth.users.
 *
 * Запуск:
 *   npx tsx scripts/delete-client.ts 63                  # dry-run
 *   npx tsx scripts/delete-client.ts 63 --confirm        # удалить
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const STORAGE_BUCKET = 'client-docs'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

async function listAllFiles(prefix: string): Promise<string[]> {
  const result: string[] = []
  const { data } = await sb.storage.from(STORAGE_BUCKET).list(prefix, { limit: 1000 })
  if (!data) return result
  for (const item of data) {
    if (item.id) result.push(`${prefix}/${item.name}`)
    else result.push(...await listAllFiles(`${prefix}/${item.name}`))
  }
  return result
}

async function main() {
  const id = Number(process.argv[2])
  const confirm = process.argv.includes('--confirm')
  if (!id) { console.error('Usage: npx tsx scripts/delete-client.ts <id> [--confirm]'); process.exit(1) }

  const { data: client } = await sb.from('clients').select('id, name, email').eq('id', id).maybeSingle()
  if (!client) { console.error(`Client id=${id} не найден`); process.exit(1) }

  console.log(`Удалить: id=${client.id} · ${client.name} · ${client.email || '(no email)'}\n`)

  const tables = [
    'client_applications', 'client_activities', 'client_essays', 'client_documents',
    'client_universities', 'client_scholarships', 'client_stages',
    'client_invitations', 'client_checklist_progress',
    'client_tg_messages', 'client_tg_files',
  ]
  for (const t of tables) {
    const { count } = await sb.from(t).select('id', { count: 'exact', head: true }).eq('client_id', id)
    console.log(`  ${t}: ${count ?? 0}`)
  }
  const files = await listAllFiles(`clients/${id}`)
  console.log(`  storage files: ${files.length}`)

  const { data: authList } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const authUser = client.email ? authList?.users.find(u => u.email === client.email) : null
  console.log(`  auth.users: ${authUser?.id ? `id=${authUser.id}` : 'нет'}`)

  if (!confirm) {
    console.log('\n⚠️  --confirm для удаления.')
    return
  }

  console.log('\n--- УДАЛЕНИЕ ---')
  if (files.length) {
    const { error } = await sb.storage.from(STORAGE_BUCKET).remove(files)
    console.log(`  storage: removed ${files.length}${error ? ` (${error.message})` : ''}`)
  }
  for (const t of tables) {
    const { error } = await sb.from(t).delete().eq('client_id', id)
    console.log(`  ${t}: deleted${error ? ` (${error.message})` : ''}`)
  }
  const { error: cErr } = await sb.from('clients').delete().eq('id', id)
  console.log(`  clients: deleted${cErr ? ` (${cErr.message})` : ''}`)
  if (client.email) {
    const { error: uErr } = await sb.from('users').delete().eq('email', client.email)
    console.log(`  public.users: deleted${uErr ? ` (${uErr.message})` : ''}`)
  }
  if (authUser) {
    const { error: aErr } = await sb.auth.admin.deleteUser(authUser.id)
    console.log(`  auth.users: deleted${aErr ? ` (${aErr.message})` : ''}`)
  }
  console.log('\n✅ Готово.')
}
main().catch(e => { console.error(e); process.exit(1) })
