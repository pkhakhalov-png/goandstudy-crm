/**
 * Seed каталога — добор программ по Словении (si), партия 2.
 * Вузы уже заведены (UL / Nova Gorica / Primorska) — добавляем только программы.
 * Данные из открытых источников + официальных страниц программ (июль 2026).
 *
 *   npx tsx scripts/add-si-programs-batch2.ts            # dry-run (ничего не пишет)
 *   npx tsx scripts/add-si-programs-batch2.ts --confirm  # выполнить вставку
 *
 * Идемпотентен: вуз/программа с совпадающим именем не дублируются.
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

type Prog = {
  name: string          // русское название
  en: string            // англ. название (в program_description)
  faculty?: string
  specialty: string
  degree: 'Bachelor' | 'Master' | 'PhD'
  language: string
  tuition: number | null
  tuitionText: string
  start: string
  deadline?: string
  duration: string
  reqs: string[]
  scholarships?: string | null
  caveat?: string
  url: string
}
type School = {
  name: string          // должен совпадать с уже заведённым вузом (дедуп по имени)
  city: string
  cc: 'si'
  type: string
  qs: number | null
  programs: Prog[]
}

const HEDGE_SI =
  'Не-ЕС студенты платят обучение (граждане ЕС учатся бесплатно в госвузах). Точную стоимость и дедлайны уточняем при поступлении.'
const DEADLINE_SI = 'Уточняется (обычно весна, отдельный конкурс для не-ЕС)'

// Первый цикл UL обычно ведётся на словенском — на англ. странице язык не указан.
const UL_LANG_CAVEAT =
  'Язык обучения на англ. странице УЛ не указан — первый цикл УЛ обычно ведётся на словенском; уточняем.'
const REQS_SI_SLO = [
  'Аттестат о среднем образовании',
  'Знание словенского языка (языковой сертификат/экзамен)',
  'Нострификация аттестата (VEM)',
]
const REQS_SI_SLO_EN = [
  'Аттестат о среднем образовании',
  'Английский (IELTS 6.0+) или словенский',
  'Нострификация аттестата (VEM)',
]

const SCHOOLS: School[] = [
  {
    name: 'University of Ljubljana', city: 'Любляна', cc: 'si', type: 'Государственный', qs: 535,
    programs: [
      { name: 'Административная информатика', en: 'Administrative Informatics', faculty: 'Faculty of Public Administration (междисц. с FRI)', specialty: 'IT и технологии', degree: 'Bachelor', language: 'Словенский (уточняется)', tuition: 5500, tuitionText: '€5,500/год (не-ЕС)', start: 'Октябрь', duration: '3 года (180 ECTS)', reqs: REQS_SI_SLO, scholarships: 'CEEPUS, Erasmus+, Ad futura', caveat: UL_LANG_CAVEAT, url: 'https://www.uni-lj.si/en/programmes/administrative-informatics' },
      { name: 'Компьютерные науки и информатика', en: 'Computer and Information Science', faculty: 'Faculty of Computer and Information Science (FRI)', specialty: 'IT и технологии', degree: 'Bachelor', language: 'Словенский (уточняется)', tuition: 11000, tuitionText: '€11,000/год (не-ЕС)', start: 'Октябрь', duration: '3 года (180 ECTS)', reqs: REQS_SI_SLO, scholarships: 'CEEPUS, Erasmus+, Ad futura', caveat: UL_LANG_CAVEAT, url: 'https://www.uni-lj.si/en/programmes/racunalnistvo-in-informatika-3' },
      { name: 'Компьютерные науки и математика', en: 'Computer Science and Mathematics', faculty: 'FRI + Faculty of Mathematics and Physics', specialty: 'IT и технологии', degree: 'Bachelor', language: 'Словенский (уточняется)', tuition: 11000, tuitionText: '€11,000/год (не-ЕС)', start: 'Октябрь', duration: '3 года (180 ECTS)', reqs: REQS_SI_SLO, scholarships: 'CEEPUS, Erasmus+, Ad futura', caveat: UL_LANG_CAVEAT, url: 'https://www.uni-lj.si/en/programmes/computer-science-and-mathematics-2' },
      { name: 'Электротехника', en: 'Electrical Engineering', faculty: 'Faculty of Electrical Engineering', specialty: 'Инженерия', degree: 'Bachelor', language: 'Словенский (уточняется)', tuition: 11000, tuitionText: '€11,000/год (не-ЕС)', start: 'Октябрь', duration: '3 года (180 ECTS)', reqs: REQS_SI_SLO, scholarships: 'CEEPUS, Erasmus+, Ad futura', caveat: UL_LANG_CAVEAT, url: 'https://www.uni-lj.si/en/programmes/electrical-engineering-2' },
      { name: 'Финансовая математика', en: 'Financial Mathematics', faculty: 'Faculty of Mathematics and Physics (FMF)', specialty: 'Экономика и финансы', degree: 'Bachelor', language: 'Словенский (уточняется)', tuition: 8000, tuitionText: '€8,000/год (не-ЕС)', start: 'Октябрь', duration: '3 года (180 ECTS)', reqs: REQS_SI_SLO, scholarships: 'CEEPUS, Erasmus+, Ad futura', caveat: UL_LANG_CAVEAT, url: 'https://www.uni-lj.si/en/programmes/financial-mathematics' },
    ],
  },
  {
    name: 'University of Nova Gorica', city: 'Нова-Горица', cc: 'si', type: 'Государственный', qs: null,
    programs: [
      { name: 'Инженерия и менеджмент', en: 'Engineering and Management', faculty: 'School of Engineering and Management', specialty: 'Инженерия', degree: 'Bachelor', language: 'Словенский', tuition: 2800, tuitionText: '€2,800/год (не-ЕС)', start: 'Октябрь', duration: '3 года (180 ECTS)', reqs: REQS_SI_SLO, scholarships: 'CEEPUS, Erasmus+, Ad futura', url: 'https://ung.si/en/schools/school-of-engineering-and-management/programmes/1GI/' },
    ],
  },
  {
    name: 'University of Primorska', city: 'Копер', cc: 'si', type: 'Государственный', qs: null,
    programs: [
      // NB: «Компьютерные науки» (Računalništvo in informatika) уже заведена — не дублируем,
      // а обновляем существующую запись прямым URL программы (см. UPDATES ниже).
      { name: 'Математика и компьютерные науки', en: 'Mathematics and Computer Science (Matematika in računalništvo)', faculty: 'FAMNIT', specialty: 'IT и технологии', degree: 'Bachelor', language: 'Словенский/Английский', tuition: 3150, tuitionText: '€3,150/год (не-ЕС)', start: 'Октябрь', duration: '3 года (180 ECTS)', reqs: REQS_SI_SLO_EN, scholarships: 'CEEPUS, Erasmus+, Ad futura', url: 'https://www.famnit.upr.si/sl//izobrazevanje/dodiplomski-studij/ma-ra' },
    ],
  },
]

// Патчи существующих записей (без создания дублей).
// Primorska «Компьютерные науки» = Računalništvo in informatika — обновляем прямой URL программы + язык.
type Update = { school: string; cc: 'si'; name: string; patch: Record<string, unknown> }
const UPDATES: Update[] = [
  {
    school: 'University of Primorska', cc: 'si', name: 'Компьютерные науки',
    patch: {
      source_url: 'https://www.famnit.upr.si/sl/izobrazevanje/dodiplomski-studij/racunalnistvo-in-informatika/',
      course_website: 'https://www.famnit.upr.si/sl/izobrazevanje/dodiplomski-studij/racunalnistvo-in-informatika/',
      language_text: 'Словенский/Английский',
    },
  },
]

function buildCuratorNote(p: Prog): string {
  const parts: string[] = []
  if (p.faculty) parts.push(`${p.faculty}.`)
  if (p.caveat) parts.push(p.caveat)
  parts.push(HEDGE_SI)
  return parts.join(' ')
}

async function main() {
  const totalPrograms = SCHOOLS.reduce((n, s) => n + s.programs.length, 0)
  console.log(`План: ${SCHOOLS.length} вуза, ${totalPrograms} программ (si, партия 2)\n`)

  let progInserted = 0, progSkipped = 0, schoolsMissing = 0

  for (const s of SCHOOLS) {
    // Вуз должен уже существовать — по нему только добавляем программы.
    const { data: existSchools } = await parser.from('schools')
      .select('id, name').eq('country_code', s.cc).ilike('name', s.name)
    if (!existSchools || !existSchools.length) {
      console.log(`✗ вуз не найден в parser DB: ${s.name} — пропускаю его программы`)
      schoolsMissing++
      continue
    }
    const schoolId = existSchools[0].id
    console.log(`↺ вуз: ${s.name} (#${schoolId})`)

    for (const p of s.programs) {
      const { data: existProg } = await parser.from('programs')
        .select('id').eq('school_id', schoolId).ilike('name', p.name)
      if (existProg && existProg.length) {
        progSkipped++
        console.log(`   ↺ программа есть: ${p.name}`)
        continue
      }
      console.log(`   ＋ ${p.degree} · ${p.name} · ${p.specialty} · ${p.language} · ${p.tuitionText}`)
      if (CONFIRM) {
        const { error } = await parser.from('programs').insert({
          school_id: schoolId,
          name: p.name,
          program_description: p.faculty ? `${p.en} — ${p.faculty}` : p.en,
          specialty_group: p.specialty,
          degree_text: p.degree,
          language_text: p.language,
          tuition: p.tuition,
          tuition_text: p.tuitionText,
          start_date_text: p.start,
          deadline_text: p.deadline || DEADLINE_SI,
          duration_text: p.duration,
          entry_requirements: p.reqs,
          scholarships_text: p.scholarships ?? null,
          curator_note: buildCuratorNote(p),
          source: 'curator_gh',
          source_url: p.url,
          course_website: p.url,
        })
        if (error) { console.error(`     ✗ вставка программы: ${error.message}`); process.exit(1) }
      }
      progInserted++
    }
  }

  // Патчи существующих записей
  let updated = 0, updSkipped = 0
  for (const u of UPDATES) {
    const { data: sch } = await parser.from('schools')
      .select('id').eq('country_code', u.cc).ilike('name', u.school)
    if (!sch || !sch.length) { console.log(`✗ патч: вуз не найден — ${u.school}`); continue }
    const { data: prog } = await parser.from('programs')
      .select('id').eq('school_id', sch[0].id).ilike('name', u.name)
    if (!prog || !prog.length) { console.log(`✗ патч: программа не найдена — ${u.school} · ${u.name}`); updSkipped++; continue }
    console.log(`~ патч: ${u.school} · ${u.name} (#${prog[0].id}) ← ${JSON.stringify(u.patch)}`)
    if (CONFIRM) {
      const { error } = await parser.from('programs').update(u.patch).eq('id', prog[0].id)
      if (error) { console.error(`   ✗ ${error.message}`); process.exit(1) }
    }
    updated++
  }

  console.log(`\nИтог: программы +${progInserted} (пропущено ${progSkipped}, вузов не найдено ${schoolsMissing}); патчей ${updated} (не найдено ${updSkipped})`)

  if (!CONFIRM) {
    console.log('\n⚠️ dry-run. Ничего не записано. Запусти с --confirm чтобы выполнить.')
    return
  }

  console.log('\n=== Проверка search_programs (si) ===')
  const { data, error } = await parser.rpc('search_programs', {
    p_country: 'si', p_limit: 5, p_offset: 0, p_count_cap: null,
  })
  if (error) console.log(`  si: RPC error — ${error.message}`)
  else console.log(`  si: total = ${(data as any)?.total}`)
}
main().catch(e => { console.error(e); process.exit(1) })
