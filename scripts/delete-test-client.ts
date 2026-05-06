/**
 * Удаление NEWCLIENT (id=62, h.pavel@inbox.ru) для повторного тестирования.
 *
 * Удаляет:
 *   1. Файлы клиента из Storage (client-docs/clients/62/*)
 *   2. Каскадные записи (client_applications, client_activities, client_essays,
 *      client_documents, client_universities, client_scholarships, client_stages,
 *      client_invitations, client_checklist_progress, client_tg_*) — cascade FK
 *   3. clients row id=62
 *   4. public.users где email = h.pavel@inbox.ru
 *   5. auth.users где email = h.pavel@inbox.ru
 *
 * Запуск: npx tsx scripts/delete-test-client.ts --confirm
 */

import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const TARGET_CLIENT_ID = 62
const TARGET_EMAIL = 'h.pavel@inbox.ru'
const STORAGE_BUCKET = 'client-docs'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

async function main() {
  const confirm = process.argv.includes('--confirm')

  // 0. Покажем что будем удалять
  const { data: client } = await sb.from('clients').select('id, name, email').eq('id', TARGET_CLIENT_ID).maybeSingle()
  console.log('Будет удалено:')
  console.log(`  client: ${client?.id} · ${client?.name} · ${client?.email}`)

  for (const t of ['client_applications', 'client_activities', 'client_essays', 'client_documents', 'client_universities', 'client_scholarships', 'client_stages', 'client_invitations']) {
    const { count } = await sb.from(t).select('id', { count: 'exact', head: true }).eq('client_id', TARGET_CLIENT_ID)
    console.log(`  ${t}: ${count ?? 0} записей`)
  }

  const { data: storageFiles } = await sb.storage.from(STORAGE_BUCKET).list(`clients/${TARGET_CLIENT_ID}`, { limit: 100 })
  console.log(`  storage files: ${storageFiles?.length ?? 0}`)

  const { data: authList } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const authUser = authList?.users.find(u => u.email === TARGET_EMAIL)
  console.log(`  auth.users: ${authUser?.id ? `id=${authUser.id}` : 'нет'}`)

  if (!confirm) {
    console.log('\n⚠️  Запусти с --confirm для удаления.')
    return
  }

  console.log('\n--- УДАЛЕНИЕ ---')

  // 1. Storage — удаляем все файлы клиента
  // Listing only top-level — нужны все sub-folders
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
  const allFiles = await listAllFiles(`clients/${TARGET_CLIENT_ID}`)
  if (allFiles.length) {
    const { error } = await sb.storage.from(STORAGE_BUCKET).remove(allFiles)
    console.log(`  storage: removed ${allFiles.length} files${error ? ` (error: ${error.message})` : ''}`)
  } else {
    console.log('  storage: ничего не было')
  }

  // 2. Связанные таблицы — на всякий случай явно (cascade FK не везде гарантирован)
  // application_documents через application_id — заполнится через cascade
  for (const t of ['client_applications', 'client_activities', 'client_essays', 'client_documents', 'client_universities', 'client_scholarships', 'client_stages', 'client_checklist_progress', 'client_invitations', 'client_tg_messages', 'client_tg_files']) {
    const { error } = await sb.from(t).delete().eq('client_id', TARGET_CLIENT_ID)
    console.log(`  ${t}: deleted${error ? ` (${error.message})` : ''}`)
  }

  // 3. clients row
  const { error: cErr } = await sb.from('clients').delete().eq('id', TARGET_CLIENT_ID)
  console.log(`  clients: deleted${cErr ? ` (${cErr.message})` : ''}`)

  // 4. public.users
  const { error: uErr } = await sb.from('users').delete().eq('email', TARGET_EMAIL)
  console.log(`  public.users: deleted${uErr ? ` (${uErr.message})` : ''}`)

  // 5. auth.users
  if (authUser) {
    const { error: aErr } = await sb.auth.admin.deleteUser(authUser.id)
    console.log(`  auth.users: deleted${aErr ? ` (${aErr.message})` : ''}`)
  }

  console.log('\n✅ Готово.')
}

main().catch(e => { console.error(e); process.exit(1) })
