/**
 * Каталог: добавить Швецию и Финляндию (новые вузы + программы) и 3 программы к Италии.
 *
 *   Швеция  — Kristianstad University (нов. школа, se): 2 бакалавриата.
 *   Финляндия — Satakunta UAS / SAMK (нов. школа, fi): 2 Bachelor of Engineering.
 *   Италия  — программы к существующим вузам: UniMi #5002, Torino #5019, Sapienza #5030.
 *
 * Данные сверены по офиц. страницам / порталам (июль 2026). Точные суммы по ISEE и
 * дедлайны меняются по годам — в curator_note помечено «уточняем».
 *
 *   npx tsx scripts/add-se-fi-it-programs.ts            # dry-run
 *   npx tsx scripts/add-se-fi-it-programs.ts --confirm  # выполнить
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const parser = createClient(process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!, process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const CONFIRM = process.argv.includes('--confirm')
const UNIMI_ID = 5002, TORINO_ID = 5019, SAPIENZA_ID = 5030

// ─────────────────────────── Швеция ───────────────────────────
const kristianstadSchool = {
  name: 'Kristianstad University (Högskolan Kristianstad)',
  city: 'Кристианстад',
  country_code: 'se',
  university_type: 'Государственный',
  qs_rank: null as number | null,
  curator_note: 'Государственный университет на юге Швеции (г. Кристианстад). Обучение на английском, кампусная модель. Для граждан ЕС/ЕЭЗ обучение бесплатное; для остальных — платное (стипендии ограничены).',
  source: 'curator_gh',
}
const seCommon = {
  degree_text: 'Bachelor', language_text: 'Английский', specialty_group: 'IT и технологии',
  tuition: 11900,
  tuition_text: '~135 000 SEK/год (~€11 900); всего 405 000 SEK за 3 года. ЕС/ЕЭЗ — бесплатно',
  duration_text: '3 года (180 ECTS)',
  start_date_text: 'Осенний семестр (август/сентябрь)',
  deadline_text: '~15 января (universityadmissions.se, осенний приём)',
  living_cost_text: '~8 000–10 000 SEK', living_cost_period: 'в месяц',
  entry_requirements: ['Аттестат о среднем образовании', 'Математика (уровень для инженерных программ)', 'Английский: IELTS 6.0–6.5 (Swedish English 6) / TOEFL iBT ~80'],
  accommodation_options: ['Студенческое жильё через университет / город Кристианстад', 'Частная аренда'],
  scholarships_text: 'Ограниченные стипендии для платных студентов (Swedish Institute, вузовские)',
  source: 'curator_gh',
}
const kristianstadPrograms = (schoolId: number) => [
  { school_id: schoolId, name: 'Bachelor Programme in Computer Science and Engineering — Internet of Things (IoT)',
    program_description: 'Бакалавриат по компьютерным наукам и инженерии со специализацией «Интернет вещей» (IoT). Обучение на английском.',
    curator_note: 'Kristianstad University (Швеция), англ. бакалавриат CS & Engineering со специализацией IoT, 3 года / 180 ECTS. Плата ~135 000 SEK/год для не-ЕС (всего 405 000 SEK), ЕС/ЕЭЗ — бесплатно. Осенний приём, дедлайн ~15 января на universityadmissions.se. Точные даты/суммы уточняем.',
    source_url: 'https://www.hkr.se/en/program/tbit3/', ...seCommon },
  { school_id: schoolId, name: 'Bachelor Programme in Software Development',
    program_description: 'Бакалавриат по разработке ПО (Software Development). Обучение на английском.',
    curator_note: 'Kristianstad University (Швеция), англ. бакалавриат по разработке ПО, 3 года / 180 ECTS. Плата ~135 000 SEK/год для не-ЕС (всего 405 000 SEK), ЕС/ЕЭЗ — бесплатно. Осенний приём, дедлайн ~15 января. Точные даты/суммы уточняем.',
    source_url: 'https://www.hkr.se/en/program/tbse3/', ...seCommon },
]

// ─────────────────────────── Финляндия ───────────────────────────
const samkSchool = {
  name: 'Satakunta University of Applied Sciences (SAMK)',
  city: 'Пори',
  country_code: 'fi',
  university_type: 'Университет прикладных наук',
  qs_rank: null as number | null,
  curator_note: 'Финский университет прикладных наук (UAS) в г. Пори. Инженерные бакалавриаты (Bachelor of Engineering) на английском, 240 ECTS / 4 года, практико-ориентированные. Для не-ЕС/ЕЭЗ обучение платное (есть стипендии SAMK), для ЕС/ЕЭЗ — бесплатно.',
  source: 'curator_gh',
}
const fiCommon = {
  degree_text: 'Bachelor', language_text: 'Английский',
  tuition: 10500,
  tuition_text: '€10,500/год (не-ЕС/ЕЭЗ); ЕС/ЕЭЗ — бесплатно',
  duration_text: '4 года (240 ECTS)',
  start_date_text: 'Январь 2027 (осенний тур подачи)',
  deadline_text: '22 сентября – 6 октября 2026 (Studyinfo.fi)',
  living_cost_text: '~€700–900', living_cost_period: 'в месяц',
  entry_requirements: ['Аттестат о среднем образовании', 'Вступительный отбор (SAMK / совместный отбор Studyinfo)', 'Английский: IELTS 6.0 / TOEFL iBT 78–80 (или эквивалент)'],
  accommodation_options: ['Студенческие общежития в Пори (напр. фонд POSOA)', 'Частная аренда'],
  scholarships_text: 'Стипендии SAMK для платных студентов (скидка на обучение при успеваемости)',
  source: 'curator_gh',
}
const samkPrograms = (schoolId: number) => [
  { school_id: schoolId, name: 'Robotics — Bachelor of Engineering',
    program_description: 'Инженерный бакалавриат по робототехнике (Bachelor of Engineering). Обучение на английском, кампус Пори.',
    specialty_group: 'Инженерия',
    curator_note: 'SAMK (Пори, Финляндия), Bachelor of Engineering — Robotics, 4 года / 240 ECTS, англ. ~45 мест. Плата €10,500/год для не-ЕС (ЕС/ЕЭЗ бесплатно), есть стипендии SAMK. Подача 22 сен – 6 окт 2026 (Studyinfo.fi), старт январь 2027. Точные даты уточняем.',
    source_url: 'https://www.samk.fi/en/degree/robotics-bachelor-of-engineering/', ...fiCommon },
  { school_id: schoolId, name: 'Artificial Intelligence (Data Engineering) — Bachelor of Engineering',
    program_description: 'Инженерный бакалавриат по искусственному интеллекту / инженерии данных (Bachelor of Engineering). Обучение на английском, кампус Пори.',
    specialty_group: 'IT и технологии',
    curator_note: 'SAMK (Пори, Финляндия), Bachelor of Engineering — Artificial Intelligence (Data Engineering), 4 года / 240 ECTS, англ. ~30 мест. Плата €10,500/год для не-ЕС (ЕС/ЕЭЗ бесплатно), есть стипендии SAMK. Подача 22 сен – 6 окт 2026 (Studyinfo.fi), старт январь 2027. Точные даты уточняем.',
    source_url: 'https://www.samk.fi/en/degree/artificial-intelligence-bachelor-of-engineering/', ...fiCommon },
]

// ─────────────────────────── Италия (к существующим вузам) ───────────────────────────
const italyPrograms = [
  { school_id: UNIMI_ID, name: 'Artificial Intelligence (Bachelor)',
    program_description: 'Международный бакалавриат по искусственному интеллекту — совместный проект университетов Милана (Statale), Милан-Бикокка и Павии. Обучение на английском.',
    specialty_group: 'IT и технологии', degree_text: 'Bachelor', language_text: 'Английский',
    tuition: 3000, tuition_text: '~€0–3,900/год (гос., по ISEE; у не-ЕС обычно ниже)',
    duration_text: '3 года (180 CFU)', start_date_text: 'Октябрь (осенний семестр)',
    deadline_text: 'Приём не-ЕС — весна (Universitaly + вступит. тест); уточняется по годам',
    living_cost_text: '~€850–1 200', living_cost_period: 'в месяц',
    entry_requirements: ['Аттестат (12 лет обучения)', 'Вступительный тест (TOLC / отбор программы)', 'Английский B2 (IELTS ~6.0)'],
    accommodation_options: ['Студенческие резиденции (EDiSU Павия / DSU Милан)', 'Частная аренда'],
    scholarships_text: 'Региональные стипендии DSU/EDiSU (по ISEE), освобождение от платы',
    curator_note: 'Совместная программа трёх кампусов (Милан Statale, Милан-Бикокка, Павия), администрация — Павия. 180 мест, ~45 для не-ЕС из-за рубежа (2026/27). В базе привязал к Università degli Studi di Milano (UniMi). Плата в гос. вузах Италии — по ISEE (доход семьи), у иностранцев обычно низкая. Точные суммы/дедлайны/тест уточняем.',
    source_url: 'https://www.unimi.it/en/education/bachelor/artificial-intelligence', source: 'curator_gh' },
  { school_id: TORINO_ID, name: 'Economics and Finance with Data Science (Bachelor)',
    program_description: 'Бакалавриат (laurea triennale) по экономике и финансам с элементами Data Science, на английском языке.',
    specialty_group: 'Экономика и финансы', degree_text: 'Bachelor', language_text: 'Английский',
    tuition: 2500, tuition_text: '~€0–2 800/год (гос., по ISEE)',
    duration_text: '3 года (180 CFU)', start_date_text: 'Сентябрь/Октябрь',
    deadline_text: 'Приём не-ЕС — весна/лето (Universitaly + отбор/TOLC); уточняется',
    living_cost_text: '~€800–1 100', living_cost_period: 'в месяц',
    entry_requirements: ['Аттестат (12 лет обучения)', 'Вступительный отбор (TOLC-E / тест программы)', 'Английский B2 (IELTS ~6.0)'],
    accommodation_options: ['Студенческие резиденции EDISU Piemonte', 'Частная аренда'],
    scholarships_text: 'Стипендии EDISU Piemonte (по ISEE), освобождение от платы',
    curator_note: 'Laurea triennale на английском в Университете Турина: экономика/финансы + Data Science. Плата — по ISEE, у иностранцев обычно низкая. Точные суммы/дедлайны/тест уточняем.',
    source_url: 'https://unito.coursecatalogue.cineca.it/corsi/2025/40375', source: 'curator_gh' },
  { school_id: SAPIENZA_ID, name: 'Applied Computer Science and Artificial Intelligence (ACSAI, Bachelor)',
    program_description: 'Бакалавриат по прикладной информатике и искусственному интеллекту, полностью на английском.',
    specialty_group: 'IT и технологии', degree_text: 'Bachelor', language_text: 'Английский',
    tuition: 3016, application_fee: 40, tuition_text: '~€3 016/год (+ €40 регистрационный сбор); по ISEE может быть меньше',
    duration_text: '3 года (180 CFU)', start_date_text: 'Сентябрь/Октябрь',
    deadline_text: 'По Call for applications; вступит. тест TOLC-I или SAT — уточняется по годам',
    living_cost_text: '~€900–1 300', living_cost_period: 'в месяц',
    entry_requirements: ['Аттестат (12 лет обучения)', 'Вступительный экзамен: TOLC-I или SAT', 'Английский: IELTS 5.5 / TOEFL iBT 80'],
    accommodation_options: ['Студенческие резиденции DiSCo Lazio', 'Частная аренда в Риме'],
    scholarships_text: 'Стипендии DiSCo Lazio (по ISEE), освобождение от платы',
    curator_note: 'ACSAI, Sapienza (Рим) — 3 года, все курсы на английском. Плата ~€3 016/год + €40 сбор (по ISEE может быть меньше). Поступление: TOLC-I или SAT + английский (IELTS 5.5 / TOEFL 80). Точные дедлайны по годам уточняем.',
    source_url: 'https://acsai.di.uniroma1.it/', source: 'curator_gh' },
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
  console.log('Швеция: Kristianstad + 2 программы')
  console.log('Финляндия: SAMK + 2 программы')
  console.log('Италия: 3 программы → UniMi #5002, Torino #5019, Sapienza #5030')

  if (!CONFIRM) {
    console.log('\nПрограммы Италии (превью имён):', italyPrograms.map(p => p.name))
    console.log('\n⚠️ dry-run. Запусти с --confirm чтобы выполнить.')
    return
  }

  console.log('\n— Швеция —')
  const seId = await ensureSchool(kristianstadSchool, '%kristianstad%')
  for (const p of kristianstadPrograms(seId)) await insertProgram(p)

  console.log('\n— Финляндия —')
  const fiId = await ensureSchool(samkSchool, '%satakunta%')
  for (const p of samkPrograms(fiId)) await insertProgram(p)

  console.log('\n— Италия —')
  for (const p of italyPrograms) await insertProgram(p)

  // verify
  console.log('\n=== ПРОВЕРКА ===')
  for (const [label, id] of [['Kristianstad', seId], ['SAMK', fiId]] as [string, number][]) {
    const { data } = await parser.from('programs').select('id, name, tuition_text').eq('school_id', id)
    console.log(`${label} (school ${id}):`, JSON.stringify(data, null, 2))
  }
  for (const [label, id] of [['UniMi', UNIMI_ID], ['Torino', TORINO_ID], ['Sapienza', SAPIENZA_ID]] as [string, number][]) {
    const { data } = await parser.from('programs').select('id, name').eq('school_id', id).eq('source', 'curator_gh')
    console.log(`${label} (curator_gh):`, JSON.stringify(data))
  }
}
main().catch(e => { console.error(e); process.exit(1) })
