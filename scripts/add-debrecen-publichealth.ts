/**
 * Добавить программу "Public Health (MSc)" вузу University of Debrecen
 * (school_id=4383) в базу парсера. В каталоге у Дебрецена была только
 * "IT и технологии" — куратор не находил Public Health.
 *
 *   npx tsx scripts/add-debrecen-publichealth.ts            # dry-run
 *   npx tsx scripts/add-debrecen-publichealth.ts --confirm  # вставить
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const parser = createClient(process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!, process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const SCHOOL_ID = 4383
const CONFIRM = process.argv.includes('--confirm')

const row = {
  school_id: SCHOOL_ID,
  name: 'Общественное здоровье (Public Health)',
  program_description: 'Public Health MSc — эпидемиология, профилактика, менеджмент и политика здравоохранения',
  specialty_group: 'Медицина и здоровье',
  degree_text: 'Master',
  language_text: 'Английский',
  tuition: 7000,
  tuition_text: '€7,000–9,000',
  start_date_text: 'Сентябрь',
  deadline_text: 'Февраль–Май',
  duration_text: '2 года (очно, on-campus)',
  living_cost_text: '€300–600',
  living_cost_period: 'в месяц',
  entry_requirements: ['Первый диплом релевантного/смежного профиля', 'Английский B2 (IELTS)', 'Онлайн-интервью', 'Stipendium Hungaricum eligible'],
  accommodation_options: ['UD Kollégium (150–250€/мес)', 'Debrecen частная аренда (очень доступная)'],
  scholarships_text: 'Stipendium Hungaricum · UD Merit Scholarships · скидки',
  curator_note: 'Общественное здоровье с акцентом на эпидемиологию, профилактику, менеджмент и политику здравоохранения. Очно, на английском, есть 4-недельная практика. Поступление через онлайн-интервью; доступны стипендии и скидки. Английский B2. Стоимость уточняем при заинтересованности (венгерские программы обычно ~€7000–9000/год). Профиль релевантен, недорого, англоязычно. Венгрия — одна из самых доступных стран по стоимости жизни.',
  source: 'curator_gh',
}

async function main() {
  const { data: existing } = await parser.from('programs')
    .select('id, name').eq('school_id', SCHOOL_ID).or('name.ilike.%public health%,name.ilike.%обществен%,name.ilike.%здоров%')
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

  // Проверка через тот же RPC, что и каталог
  const { data: rpc } = await parser.rpc('search_programs', {
    p_school_id: SCHOOL_ID, p_specialty: 'Медицина и здоровье', p_levels: ['master'],
    p_limit: 24, p_offset: 0, p_count_cap: null,
  })
  console.log('search_programs(school=4383, spec=Медицина, level=master) total:', (rpc as any)?.total)
  console.log('rows:', JSON.stringify(((rpc as any)?.rows ?? []).map((r: any) => ({ id: r.id, name: r.name, deg: r.degree_text }))))
}
main().catch(e => { console.error(e); process.exit(1) })
