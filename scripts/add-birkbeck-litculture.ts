/**
 * Добавить программу "MA Contemporary Literature and Culture" вузу
 * Birkbeck, University of London (school_id=3465) в базу парсера.
 *
 *   npx tsx scripts/add-birkbeck-litculture.ts            # dry-run
 *   npx tsx scripts/add-birkbeck-litculture.ts --confirm  # вставить
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const parser = createClient(process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!, process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const SCHOOL_ID = 3465
const CONFIRM = process.argv.includes('--confirm')

const row = {
  school_id: SCHOOL_ID,
  name: 'Современная литература и культура',
  program_description: 'MA Contemporary Literature and Culture',
  specialty_group: 'Гуманитарные науки',
  degree_text: 'Master',
  language_text: 'Английский',
  tuition: 18500,
  tuition_text: '£18,500',
  start_date_text: 'Октябрь',
  deadline_text: 'Непрерывный',
  duration_text: '12 мес. (вечерний / on-campus full-time)',
  living_cost_text: '£1800–2800',
  living_cost_period: 'в месяц',
  entry_requirements: ['Первый диплом не обязательно по English Literature', 'IELTS 6.5+', 'Опыт и зрелость — в плюс'],
  accommodation_options: ['Нет кампусного жилья', 'частная аренда Bloomsbury', 'Unite Students'],
  scholarships_text: 'Birkbeck Scholarships · Part-time student grants',
  curator_note: 'Литература и культура XXI века: новые технологии и форма нарратива, постколониальные тексты, теория. Кампус в Блумсбери (центр). Занятия в основном вечерние, но это полноценное очное на кампусе — для визы берут именно on-campus full-time. Шансы высокие: первый диплом не обязательно по English Literature, опыт и зрелость в плюс. Кем работать: культурные индустрии, медиа, контент, издательство, коммуникации, образование, academia.',
  source: 'curator_gh',
  source_url: 'https://www.bbk.ac.uk/courses/postgraduate/contemporary-literature-and-culture',
  course_website: 'https://www.bbk.ac.uk/courses/postgraduate/contemporary-literature-and-culture',
}

async function main() {
  // не дублируем, если уже есть
  const { data: existing } = await parser.from('programs')
    .select('id, name').eq('school_id', SCHOOL_ID).ilike('name', '%литература%')
  if (existing && existing.length) {
    console.log('⚠️ Уже есть похожая программа:', JSON.stringify(existing))
    return
  }

  console.log('Вставить в parser.programs:')
  console.log(JSON.stringify(row, null, 2))

  if (!CONFIRM) {
    console.log('\n⚠️ dry-run. Запусти с --confirm чтобы вставить.')
    return
  }

  const { data, error } = await parser.from('programs').insert(row).select('id, name, school_id, specialty_group, degree_text, tuition_text').single()
  if (error) { console.error('INSERT ERR:', error.message); process.exit(1) }
  console.log('\n✅ Вставлено:', JSON.stringify(data))

  // Проверка: видна ли через тот же RPC, что и каталог
  const { data: rpc } = await parser.rpc('search_programs', {
    p_school_id: SCHOOL_ID, p_specialty: 'Гуманитарные науки', p_levels: ['master'],
    p_limit: 24, p_offset: 0, p_count_cap: null,
  })
  console.log('search_programs(school=3465, spec=Гум, level=master) total:', (rpc as any)?.total)
  console.log('rows:', JSON.stringify(((rpc as any)?.rows ?? []).map((r: any) => ({ id: r.id, name: r.name, deg: r.degree_text }))))
}
main().catch(e => { console.error(e); process.exit(1) })
