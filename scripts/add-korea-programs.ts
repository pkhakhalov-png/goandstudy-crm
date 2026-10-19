/**
 * Каталог: Южная Корея (kr) — первые пять вузов и шесть программ бакалавриата.
 * Источник — подборка «Университеты Марк» (PDF, октябрь 2026): дедлайны,
 * стоимость, общежитие, требования и скидки взяты из неё дословно.
 * Данные вставляются в parser DB (schools + programs), source='curator_gh'.
 *
 *   npx tsx scripts/add-korea-programs.ts            # dry-run (ничего не пишет)
 *   npx tsx scripts/add-korea-programs.ts --confirm  # выполнить вставку
 *
 * Скрипт идемпотентен: вуз/программа с совпадающим именем не дублируются.
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const parser = createClient(
  process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!,
  process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
const CONFIRM = process.argv.includes('--confirm')

// Числовое поле tuition — в долларах: по нему работает фильтр бюджета каталога
const KRW_PER_USD = 1400
const usd = (krw: number) => Math.round(krw / KRW_PER_USD)
const won = (krw: number) => `₩${krw.toLocaleString('ru-RU')}`

// Одинаковы у всех вузов подборки
const REQS = [
  'Аттестат + апостиль (или Expected Graduation Certificate)',
  'Оценки за 9–11 класс',
  'Паспорт',
  'Свидетельство о рождении',
  'Банковская выписка (эквивалент ₩20 000 000)',
  'Языковой экзамен (IELTS)',
]

type Prog = {
  name: string
  en: string
  specialty: string
  tuitionKrw: number
  registrationKrw?: number
  deadline: string
  scholarships: string
}
type School = {
  name: string
  city: string
  type: string
  dormKrw: number
  programs: Prog[]
}

const SCHOOLS: School[] = [
  {
    name: 'Inha University', city: 'Инчхон', type: 'Частный', dormKrw: 2_700_000,
    programs: [{
      name: 'Международный бизнес и торговля', en: 'International Business & Trade',
      specialty: 'Бизнес и управление', tuitionKrw: 8_902_000, deadline: 'Май 2027',
      scholarships: '1-й семестр: 50% — IELTS 6.5; 100% на весь год — IELTS 7.0. Студентам: по GPA 3.5 — 25%, 4.0 — 50%, 4.3 — 75%, 4.5 — 100%',
    }],
  },
  {
    name: 'Incheon National University', city: 'Инчхон', type: 'Государственный', dormKrw: 2_000_000,
    programs: [{
      name: 'Международная экономика бизнеса', en: 'International Business Economics',
      specialty: 'Экономика и финансы', tuitionKrw: 5_646_000, deadline: 'Апрель 2027',
      scholarships: '1-й семестр: 30% — IELTS 6.0, 50% — IELTS 6.6, 70% — IELTS 7.0. Студентам: по GPA 3.0 — 30%, 3.5 — 50%, 4.0 — 85%, 4.5 — 100%',
    }],
  },
  {
    name: 'Seoul National University of Science and Technology (SeoulTech)', city: 'Сеул', type: 'Государственный', dormKrw: 2_000_000,
    programs: [
      {
        name: 'Бизнес-администрирование (IMS — International Management Studies)', en: 'Business Administration (IMS program – International Management Studies)',
        specialty: 'Бизнес и управление', tuitionKrw: 5_200_000, registrationKrw: 1_000_000, deadline: 'Март 2027',
        scholarships: '1-й семестр: 50% — IELTS 6.0, 70% — IELTS 6.5, 100% — IELTS 7.0 (зависит от интервью и документов). Студентам: по GPA 3.5 — 30%, 3.8 — 50%, 4.0 — 100% + общежитие',
      },
      {
        name: 'Глобальная IT-конвергенция', en: 'Department of Global IT Convergence',
        specialty: 'IT и технологии', tuitionKrw: 6_094_000, registrationKrw: 1_000_000, deadline: 'Март 2027',
        scholarships: '1-й семестр: 50% — IELTS 6.0, 70% — IELTS 6.5, 100% — IELTS 7.0 (зависит от интервью и документов). Студентам: по GPA 3.5 — 30%, 3.8 — 50%, 4.0 — 100% + общежитие',
      },
    ],
  },
  {
    name: 'Sejong University', city: 'Сеул', type: 'Частный', dormKrw: 3_000_000,
    programs: [{
      name: 'Государственное управление, экономика, глобальное лидерство', en: 'Public Administration, Economics, Global Leadership',
      specialty: 'Социальные науки', tuitionKrw: 8_890_000, deadline: 'Май 2027',
      scholarships: '1-й семестр: 30% — IELTS 5.5, 50% — IELTS 6.5, 80% — IELTS 8.0. Студентам: скидка 20–50% по GPA (минимум 3.0)',
    }],
  },
  {
    name: 'Dankook University', city: 'Йонъин (кампус Чукчон)', type: 'Частный', dormKrw: 3_000_000,
    programs: [{
      name: 'Международное бизнес-администрирование', en: 'International Business Administration',
      specialty: 'Бизнес и управление', tuitionKrw: 8_890_000, deadline: 'Май 2027',
      scholarships: '1-й семестр: 50% — IELTS 5.5, 60% — IELTS 6.5, 70% — IELTS 7.0, 100% — IELTS 7.5. Студентам: по GPA 3.0 — 30%, 3.5 — 50%, 4.0 — 70%, 4.3 — 100%',
    }],
  },
]

async function main() {
  const totalPrograms = SCHOOLS.reduce((n, s) => n + s.programs.length, 0)
  console.log(`План: ${SCHOOLS.length} вузов, ${totalPrograms} программ (kr)\n`)

  let schoolsInserted = 0, schoolsReused = 0, progInserted = 0, progSkipped = 0

  for (const s of SCHOOLS) {
    const { data: existSchools } = await parser.from('schools')
      .select('id').eq('country_code', 'kr').ilike('name', s.name)
    let schoolId: number
    if (existSchools?.length) {
      schoolId = existSchools[0].id
      schoolsReused++
      console.log(`↺ вуз есть: ${s.name} (#${schoolId})`)
    } else {
      console.log(`＋ вуз: ${s.name} — ${s.city}`)
      if (CONFIRM) {
        const { data, error } = await parser.from('schools').insert({
          name: s.name, city: s.city, country_code: 'kr', university_type: s.type,
          curator_note: 'Добавлено вручную по подборке для клиента (октябрь 2026).',
          source: 'curator_gh',
        }).select('id').single()
        if (error) { console.error(`  ✗ вставка вуза: ${error.message}`); process.exit(1) }
        schoolId = data.id
      } else {
        schoolId = -1
      }
      schoolsInserted++
    }

    for (const p of s.programs) {
      if (schoolId > 0) {
        const { data: existProg } = await parser.from('programs')
          .select('id').eq('school_id', schoolId).ilike('name', p.name)
        if (existProg?.length) { progSkipped++; console.log(`   ↺ программа есть: ${p.name}`); continue }
      }
      const tuitionText = `${won(p.tuitionKrw)}/год (≈$${usd(p.tuitionKrw).toLocaleString('en-US')})`
        + (p.registrationKrw ? ` + регистрационный сбор ${won(p.registrationKrw)}` : '')
      console.log(`   ＋ Bachelor · ${p.name} · ${p.specialty} · ${tuitionText} · дедлайн ${p.deadline}`)
      if (CONFIRM && schoolId > 0) {
        const { error } = await parser.from('programs').insert({
          school_id: schoolId,
          name: p.name,
          program_description: p.en,
          specialty_group: p.specialty,
          degree_text: 'Bachelor',
          language_text: 'Английский',
          tuition: usd(p.tuitionKrw),
          currency: 'KRW',
          tuition_text: tuitionText,
          start_date_text: 'Осень 2027',
          deadline_text: p.deadline,
          living_cost_text: `Общежитие — около ${won(s.dormKrw)}/год`,
          accommodation_options: [`Общежитие — около ${won(s.dormKrw)}/год`],
          entry_requirements: REQS,
          scholarships_text: p.scholarships,
          curator_note: `Данные из подборки для клиента (октябрь 2026), стоимость в вонах; $ — пересчёт по курсу ~${KRW_PER_USD.toLocaleString('ru-RU')} ₩/$. Точные суммы, дедлайны и наличие мест уточняем при поступлении.`,
          source: 'curator_gh',
        })
        if (error) { console.error(`     ✗ вставка программы: ${error.message}`); process.exit(1) }
      }
      progInserted++
    }
  }

  console.log(`\nИтог: вузы +${schoolsInserted} (переиспользовано ${schoolsReused}), программы +${progInserted} (пропущено ${progSkipped})`)
  if (!CONFIRM) { console.log('\n⚠️ dry-run. Ничего не записано. Запусти с --confirm чтобы выполнить.'); return }

  const { data, error } = await parser.rpc('search_programs', { p_country: 'kr', p_limit: 10, p_offset: 0, p_count_cap: null })
  console.log(`\nПроверка search_programs kr: ${error ? `ошибка — ${error.message}` : `total = ${(data as any)?.total}`}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
