import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const NEW_STAGES = [
  { code: 'profo',         title: 'Проф.Ориентация',           position: 1 },
  { code: 'strategy',      title: 'Стратегическая сессия',     position: 2 },
  { code: 'roadmap',       title: 'Дорожная карта',            position: 3 },
  { code: 'uni_search',    title: 'Подбор университетов',      position: 4 },
  { code: 'presentation',  title: 'Презентация и выбор вузов', position: 5 },
  { code: 'documents',     title: 'Документы',                 position: 6 },
  { code: 'applications',  title: 'Подача заявок',             position: 7 },
  { code: 'offer',         title: 'Оффер',                     position: 8 },
  { code: 'enrollment',    title: 'Зачисление',                position: 9 },
  { code: 'housing',       title: 'Проживание',                position: 10 },
  { code: 'visa',          title: 'Виза',                      position: 11 },
  { code: 'trip_prep',     title: 'Подготовка к поездке',      position: 12 },
]

async function main() {
  console.log('0) удаляю client_checklist_progress (FK)...')
  const { error: e0 } = await sb.from('client_checklist_progress').delete().neq('checklist_id', '00000000-0000-0000-0000-000000000000')
  if (e0) throw e0

  console.log('1) удаляю curator_stage_checklist...')
  const { error: e1 } = await sb.from('curator_stage_checklist').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (e1) throw e1

  console.log('2) удаляю curator_stages...')
  const { error: e2 } = await sb.from('curator_stages').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (e2) throw e2

  console.log('3) вставляю новые 12 стадий...')
  const { error: e3 } = await sb.from('curator_stages').insert(NEW_STAGES)
  if (e3) throw e3

  console.log('4) сбрасываю clients.current_stage_code → profo...')
  const { error: e4 } = await sb.from('clients').update({ current_stage_code: 'profo' }).not('current_stage_code', 'is', null)
  if (e4) throw e4

  console.log('5) проверка:')
  const { data } = await sb.from('curator_stages').select('position, code, title').order('position')
  data?.forEach(s => console.log(' ', s.position, '|', s.code, '|', s.title))

  console.log('\\n✅ done')
}
main().catch(e => { console.error(e); process.exit(1) })
