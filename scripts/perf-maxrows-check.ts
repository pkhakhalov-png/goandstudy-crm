// Может ли одна сделка набрать больше тысячи сообщений, задач или файлов?
// От этого зависит, безопасны ли выборки на карточке сделки: они отбирают по
// одной сделке, и пока её история меньше тысячи строк, обрезка невозможна.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function worst(table: string) {
  const counts = new Map<string, number>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select('deal_id').order('id').range(from, from + 999)
    if (error) { console.log(`${table}: ошибка ${error.message}`); return }
    for (const r of data ?? []) counts.set(r.deal_id, (counts.get(r.deal_id) ?? 0) + 1)
    if (!data || data.length < 1000) break
  }
  const top = [...counts.values()].sort((a, b) => b - a)[0] ?? 0
  const mark = top >= 800 ? '  ← близко к потолку выдачи' : ''
  console.log(`${table.padEnd(18)} самая длинная история у одной сделки: ${String(top).padStart(5)} строк${mark}`)
}

async function main() {
  console.log('\nКАРТОЧКА СДЕЛКИ: СКОЛЬКО СТРОК МОЖЕТ ПРИЙТИ НА ОДНУ СДЕЛКУ')
  console.log('─'.repeat(80))
  for (const t of ['deal_messages', 'deal_activities', 'deal_tasks', 'deal_files']) await worst(t)
  console.log('\nпотолок одной выдачи — 1000 строк\n')
}
main().catch((e) => { console.error('✗', e.message); process.exit(1) })
