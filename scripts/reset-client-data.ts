/**
 * Сбросить данные ЛК клиента (по name pattern или id), но клиента сохранить.
 * Удаляет: essays, documents (+ storage files), shortlist, scholarships,
 * applications, activities, invitations, checklist progress.
 *
 * Запуск: npx tsx scripts/reset-client-data.ts "Андрей Борецкий"
 *         npx tsx scripts/reset-client-data.ts 73   # by id
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
  const arg = process.argv[2]
  if (!arg) { console.error('Передай name или id клиента'); process.exit(1) }

  let client: { id: number; name: string; email: string | null } | null = null
  if (/^\d+$/.test(arg)) {
    const { data } = await sb.from('clients').select('id, name, email').eq('id', Number(arg)).maybeSingle()
    client = data
  } else {
    const { data } = await sb.from('clients').select('id, name, email').ilike('name', `%${arg}%`).maybeSingle()
    client = data
  }
  if (!client) { console.error('Клиент не найден'); process.exit(1) }

  console.log(`Найден клиент: id=${client.id} · ${client.name} · ${client.email}`)
  console.log('Сбрасываю данные (клиент сам остаётся, auth.users тоже)...\n')

  // Storage files
  const files = await listAllFiles(`clients/${client.id}`)
  if (files.length) {
    const { error } = await sb.storage.from(STORAGE_BUCKET).remove(files)
    console.log(`  storage: removed ${files.length} files${error ? ` (error: ${error.message})` : ''}`)
  } else {
    console.log('  storage: пусто')
  }

  // Связанные таблицы
  for (const t of ['client_applications', 'client_activities', 'client_essays', 'client_documents', 'client_universities', 'client_scholarships', 'client_stages', 'client_checklist_progress', 'client_invitations', 'client_tg_messages', 'client_tg_files']) {
    const { error, count } = await sb.from(t).delete({ count: 'exact' }).eq('client_id', client.id)
    console.log(`  ${t}: deleted ${count ?? '?'}${error ? ` (${error.message})` : ''}`)
  }

  // Сбрасываем поля проекта/roadmap/current_stage
  const { error: updErr } = await sb.from('clients')
    .update({
      project_data: null,
      roadmap_data: null,
      roadmap_approved_at: null,
      roadmap_approved_by_name: null,
      current_stage_code: null,
    })
    .eq('id', client.id)
  console.log(`  clients fields reset${updErr ? ` (${updErr.message})` : ''}`)

  console.log('\n✅ ЛК клиента сброшен. Сам клиент в БД остался — заходи под ним и тестируй с чистого листа.')
}

main().catch(e => { console.error(e); process.exit(1) })
