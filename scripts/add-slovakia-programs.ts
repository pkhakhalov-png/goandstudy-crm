/**
 * Каталог: добавить Словакию (код sk) — 2 новых вуза + по одной программе (BSc).
 *
 *   Comenius University in Bratislava, Faculty of Natural Sciences — Biological Chemistry (BSc, англ.)
 *   Slovak University of Technology (STU), FCHPT — Biochemistry and Biophysical Chemistry
 *     for Pharmaceutical Applications (BSc)
 *
 * ⚠️ Важно: у STU/FCHPT англоязычный бакалавриат на 2026/2027 НЕ открывается (0 мест),
 * доступен только словацкоязычный (бесплатный) трек. Это отмечено в curator_note.
 * Данные сверены по офиц. страницам вузов (июль 2026); точные суммы/дедлайны меняются по годам.
 *
 *   npx tsx scripts/add-slovakia-programs.ts            # dry-run
 *   npx tsx scripts/add-slovakia-programs.ts --confirm  # выполнить
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const parser = createClient(process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!, process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const CONFIRM = process.argv.includes('--confirm')

// ─────────────────────────── Comenius University (Братислава) ───────────────────────────
const comeniusSchool = {
  name: 'Comenius University in Bratislava (Univerzita Komenského)',
  city: 'Братислава',
  country_code: 'sk',
  university_type: 'Государственный',
  qs_rank: 684,
  curator_note: 'Крупнейший и самый высокий в рейтинге вуз Словакии (QS World #684, 2026 — единственный словацкий вуз в топ-1000). Прирoдоведческий факультет (Faculty of Natural Sciences) в Братиславе ведёт англоязычные бакалавриаты. Обучение на английском платное; точную стоимость уточняем напрямую у факультета.',
  source: 'curator_gh',
}
const comeniusPrograms = (schoolId: number) => [
  { school_id: schoolId, name: 'Biological Chemistry (Bachelor)',
    program_description: 'Англоязычный бакалавриат «Biological Chemistry» на Факультете естественных наук Университета Коменского (Братислава).',
    specialty_group: 'Естественные науки', degree_text: 'Bachelor', language_text: 'Английский',
    tuition: 1000,
    tuition_text: '~€1 000/год (по данным агрегаторов; официальную сумму уточняем у факультета)',
    duration_text: '3 года (180 ECTS)',
    start_date_text: 'Сентябрь 2026',
    deadline_text: '16 марта 2026 (приём на бакалавриат FNS)',
    living_cost_text: '~€500–800', living_cost_period: 'в месяц',
    entry_requirements: ['Аттестат о среднем образовании', 'Английский B2 (выпускной экзамен по английскому или межд. сертификат — IELTS/TOEFL)', 'Вступит. онлайн-тест (химия+биология) 11 июня 2026 только при превышении числа заявок', 'Регистрационный сбор €20'],
    accommodation_options: ['Студенческие общежития университета (~€80–120/мес)', 'Частная аренда в Братиславе'],
    scholarships_text: 'Программных стипендий не подтверждено — уточняем у факультета',
    curator_note: 'Comenius University (Братислава), Факультет естественных наук — англ. бакалавриат Biological Chemistry, 3 года / 180 ECTS. Дедлайн подачи 16 марта 2026, старт сентябрь 2026. Приём без экзамена, если заявок не больше мест; иначе онлайн-тест по химии и биологии 11 июня 2026. Английский B2. Регистр. сбор €20. Стоимость ~€1 000/год по агрегаторам — официальную сумму подтверждаем напрямую (katarina.milickova@uniba.sk). Точные суммы/условия уточняем.',
    source_url: 'https://fns.uniba.sk/en/study/bachelor-studies/bachelor-study-programmes/study-programmes-in-english/', source: 'curator_gh' },
]

// ─────────────────── Slovak University of Technology / STU, FCHPT (Братислава) ───────────────────
const stuSchool = {
  name: 'Slovak University of Technology in Bratislava (STU)',
  city: 'Братислава',
  country_code: 'sk',
  university_type: 'Государственный',
  qs_rank: 951,
  curator_note: 'Крупнейший технический вуз Словакии (QS World #951–1000; #388 QS Europe 2026 — лучший технический вуз страны). Факультет химической и пищевой технологии (FCHPT), Братислава.',
  source: 'curator_gh',
}
const stuPrograms = (schoolId: number) => [
  { school_id: schoolId, name: 'Biochemistry and Biophysical Chemistry for Pharmaceutical Applications (Bachelor)',
    program_description: 'Бакалавриат «Biochemistry and Biophysical Chemistry for Pharmaceutical Applications» на Факультете химической и пищевой технологии (FCHPT) STU.',
    specialty_group: 'Естественные науки', degree_text: 'Bachelor', language_text: 'Словацкий / Английский',
    tuition: 3500,
    tuition_text: 'Словацкий трек — бесплатно; англоязычный — €3 500/год (когда открывается)',
    duration_text: '3 года',
    start_date_text: 'Сентябрь',
    deadline_text: 'Уточняется у факультета (контакт: monika.chorvathova@stuba.sk)',
    living_cost_text: '~€500–800', living_cost_period: 'в месяц',
    entry_requirements: ['Аттестат о среднем образовании', 'Требования по английскому/вступит. отбору — уточняем у факультета'],
    accommodation_options: ['Студенческие общежития STU (~€80–120/мес)', 'Частная аренда в Братиславе'],
    scholarships_text: 'Не подтверждено — уточняем у факультета',
    curator_note: '⚠️ ВАЖНО: на 2026/2027 англоязычный бакалавриат FCHPT НЕ открывается (0 мест) — доступен только словацкоязычный трек (бесплатно). Англоязычный вариант (€3 500/год) идёт лишь в те годы, когда факультет его открывает. STU (Братислава), FCHPT, 3 года. Если клиенту нужно обучение на английском в наборе 2026 — программа фактически недоступна; подтверждаем актуальность у факультета (monika.chorvathova@stuba.sk). Точные суммы/дедлайны уточняем.',
    source_url: 'https://www.fchpt.stuba.sk/english/information-for-applicants/bachelor-study-programmes/biochemistry-and-biophysical-chemistry-for-pharmaceutical-applications.html?page_id=4974', source: 'curator_gh' },
]

async function insertProgram(prog: any) {
  const { data: exist } = await parser.from('programs').select('id').eq('school_id', prog.school_id).eq('name', prog.name)
  if (exist?.length) { console.log(`  ⚠️ "${prog.name}" (school ${prog.school_id}) уже есть — пропуск`); return }
  const r = await parser.from('programs').insert(prog).select('id, name, school_id').single()
  if (r.error) { console.error(`  ❌ "${prog.name}" INSERT ERR:`, r.error.message); process.exit(1) }
  console.log(`  ✅ ${prog.name} → #${r.data.id} (school ${r.data.school_id})`)
}

async function ensureSchool(school: any, matchLike: string): Promise<number> {
  const { data: exist } = await parser.from('schools').select('id, name').ilike('name', matchLike)
  if (exist?.length) { console.log(`⚠️ Школа уже есть: ${JSON.stringify(exist[0])}`); return exist[0].id }
  const r = await parser.from('schools').insert(school).select('id, name').single()
  if (r.error) { console.error('❌ SCHOOL INSERT ERR:', r.error.message); process.exit(1) }
  console.log(`✅ Школа создана: #${r.data.id} ${r.data.name}`)
  return r.data.id
}

async function main() {
  console.log(CONFIRM ? '=== ВЫПОЛНЕНИЕ ===' : '=== DRY-RUN (без --confirm) ===')
  console.log('Словакия (sk):')
  console.log('  Comenius University — Biological Chemistry (BSc)')
  console.log('  STU / FCHPT — Biochemistry and Biophysical Chemistry for Pharmaceutical Applications (BSc)')
  console.log('  ⚠️ англоязычный трек STU/FCHPT на 2026/2027 НЕ открывается (см. curator_note)')

  if (!CONFIRM) {
    console.log('\n⚠️ dry-run. Запусти с --confirm чтобы выполнить.')
    return
  }

  console.log('\n— Comenius University —')
  const cuId = await ensureSchool(comeniusSchool, '%comenius%')
  for (const p of comeniusPrograms(cuId)) await insertProgram(p)

  console.log('\n— Slovak University of Technology (STU) —')
  const stuId = await ensureSchool(stuSchool, '%slovak university of technology%')
  for (const p of stuPrograms(stuId)) await insertProgram(p)

  // verify
  console.log('\n=== ПРОВЕРКА ===')
  for (const [label, id] of [['Comenius', cuId], ['STU', stuId]] as [string, number][]) {
    const { data } = await parser.from('programs').select('id, name, tuition_text').eq('school_id', id)
    console.log(`${label} (school ${id}):`, JSON.stringify(data, null, 2))
  }
}
main().catch(e => { console.error(e); process.exit(1) })
