/**
 * Клонирует тестового клиента #76 каждому из 6 кураторов.
 * Каждый куратор получает свою копию «песочного» клиента со всеми данными:
 *  - project_data + roadmap_data (JSONB поля клиента)
 *  - client_universities (shortlist)
 *  - client_scholarships
 *  - client_essays
 *  - client_applications
 * НЕ клонируем: payments, client_activities, client_documents, history.
 *
 * Идемпотентно: если у куратора уже есть клиент с префиксом «Тест Клиент —» —
 * пропускаем, не плодим дубли.
 */

import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const SOURCE_CLIENT_ID = 76
const CURATOR_NAMES = ['Милена', 'Ксения', 'Софья', 'Анастасия', 'Евгения', 'Алина']

const CHILD_TABLES: { table: string; keep?: (row: any) => boolean }[] = [
  { table: 'client_universities' },
  { table: 'client_scholarships' },
  { table: 'client_essays' },
  { table: 'client_applications' },
]

async function cloneFor(curator: { id: string; name: string }, source: any): Promise<{ clientId: number; reused: boolean }> {
  const newName = `Тест Клиент — ${curator.name}`

  // Идемпотентность — ищем уже созданный
  const { data: existing } = await sb.from('clients')
    .select('id, name')
    .eq('curator_id', curator.id)
    .eq('name', newName)
    .maybeSingle()
  if (existing) return { clientId: existing.id, reused: true }

  // Копия источника, без id/created_at, с новым curator_id+name
  const insertRow: any = { ...source }
  delete insertRow.id
  delete insertRow.created_at
  insertRow.curator_id = curator.id
  insertRow.name = newName
  insertRow.email = null   // не привязываем к auth — это просто карточка для куратора
  insertRow.phone = null
  insertRow.telegram = null
  insertRow.phone_normalized = null
  insertRow.tg_group_chat_id = null
  insertRow.tg_group_title = null
  // salesperson_id оставляем как у источника (колонка NOT NULL)
  insertRow.curator_assigned_at = new Date().toISOString()

  const { data: inserted, error } = await sb.from('clients').insert(insertRow).select('id').single()
  if (error || !inserted) throw new Error(`insert clients: ${error?.message}`)
  const newId = inserted.id as number

  // Дочерние таблицы — копируем со ссылкой на новый client_id
  for (const cfg of CHILD_TABLES) {
    const { data: rows, error: e1 } = await sb.from(cfg.table).select('*').eq('client_id', SOURCE_CLIENT_ID)
    if (e1) { console.warn(`  ⚠ ${cfg.table}: ${e1.message}`); continue }
    const toInsert = (rows ?? [])
      .filter(r => !cfg.keep || cfg.keep(r))
      .map(r => {
        const copy: any = { ...r }
        delete copy.id
        delete copy.created_at
        copy.client_id = newId
        return copy
      })
    if (toInsert.length === 0) continue
    const { error: e2 } = await sb.from(cfg.table).insert(toInsert)
    if (e2) console.warn(`  ⚠ insert ${cfg.table}: ${e2.message}`)
  }

  return { clientId: newId, reused: false }
}

async function main() {
  // 1. source
  const { data: source, error: srcErr } = await sb.from('clients').select('*').eq('id', SOURCE_CLIENT_ID).single()
  if (srcErr || !source) { console.error('source client not found:', srcErr?.message); process.exit(1) }
  console.log(`Источник: client #${source.id} «${source.name}»`)

  // 2. кураторы по именам
  const { data: curators } = await sb.from('curators').select('id, name').in('name', CURATOR_NAMES)
  if (!curators) { console.error('кураторы не найдены'); process.exit(1) }
  const byName = new Map(curators.map(c => [c.name, c]))

  console.log()
  for (const name of CURATOR_NAMES) {
    const c = byName.get(name)
    if (!c) { console.log(`✕ ${name} — не найден в curators`); continue }
    try {
      const { clientId, reused } = await cloneFor(c, source)
      const flag = reused ? '↺ уже было' : '✓ создан'
      console.log(`${flag}: ${name.padEnd(12)} → клиент #${clientId} «Тест Клиент — ${name}»`)
    } catch (e: any) {
      console.log(`✕ ${name}: ${e.message}`)
    }
  }

  console.log('\nГотово.')
  console.log('Открыть карточку: https://crm.goandstudy.com/curator/clients/<ID>')
  console.log('Куратор увидит её в своём списке «Клиенты».')
}

main().catch(e => { console.error(e); process.exit(1) })
