/**
 * Seed каталога — именованные программы в существующие вузы:
 *   Венгрия (hu), Австрия (at), Португалия (pt), Испания (es).
 * Вузы уже заведены — добавляем только конкретные программы (по school_id).
 * Данные с официальных страниц программ (июль 2026, ресёрч GH).
 *
 *   npx tsx scripts/add-programs-hu-at-pt-es.ts            # dry-run
 *   npx tsx scripts/add-programs-hu-at-pt-es.ts --confirm  # выполнить вставку
 *
 * Идемпотентен: программа с совпадающим именем в том же вузе не дублируется.
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

type CC = 'hu' | 'at' | 'pt' | 'es'
type Prog = {
  schoolId: number
  schoolLabel: string   // для логов
  cc: CC
  name: string          // русское название
  en: string            // англ. название
  specialty: string
  degree: 'Bachelor'
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

const HEDGE: Record<CC, string> = {
  hu: 'Не-ЕС студенты платят обучение (англоязычные программы). Стоимость и дедлайны уточняем при поступлении.',
  at: 'Гос. вузы Австрии: не-ЕС платят €726,72/семестр; обучение на английском. Дедлайны и нострификацию аттестата уточняем.',
  pt: 'Приём для не-ЕС по International Student Statute (отдельный конкурс). Точную стоимость и дедлайны уточняем.',
  es: 'Стоимость зависит от региона и числа кредитов; для не-ЕС возможны повышенные ставки. Признание аттестата (homologación) обязательно.',
}
const DEADLINE: Record<CC, string> = {
  hu: 'Уточняется (осенний набор; Stipendium Hungaricum — январь)',
  at: 'Уточняется (зимний семестр — обычно до 5 сентября)',
  pt: 'Уточняется (см. сайт вуза; отдельный конкурс для не-ЕС)',
  es: 'Уточняется (июнь–июль; через UNEDasiss / PCE)',
}
const START: Record<CC, string> = { hu: 'Сентябрь', at: 'Октябрь', pt: 'Сентябрь', es: 'Сентябрь' }

const REQS: Record<CC, string[]> = {
  hu: ['Аттестат о среднем образовании', 'Английский (IELTS 5.5–6.0+ / TOEFL)', 'Вступительный экзамен/собеседование (по программе)'],
  at: ['Аттестат о среднем образовании (с признанием)', 'Английский B2 (IELTS/TOEFL)', 'Zulassung / нострификация'],
  pt: ['Аттестат о полном среднем образовании', 'Английский', 'International Student Statute (отдельный конкурс)'],
  es: ['Аттестат + признание (homologación) / UNEDasiss', 'Английский B2+ (IELTS/TOEFL)', 'Вступительные баллы (PCE / EBAU)'],
}
const SCHOL: Record<CC, string | null> = {
  hu: 'Stipendium Hungaricum (гос.), Erasmus+',
  at: 'OeAD, Erasmus+ (обучение платное для не-ЕС)',
  pt: null,
  es: 'Erasmus+, стипендии вуза',
}

const AT_TUITION = 1453 // ≈ 2 × €726,72/семестр
const AT_TUITION_TEXT = '€726,72/семестр (≈€1 453/год, не-ЕС)'

const PROGRAMS: Prog[] = [
  // ─────────────── ВЕНГРИЯ ───────────────
  { schoolId: 4375, schoolLabel: 'ELTE', cc: 'hu', name: 'Компьютерные науки (BSc)', en: 'Computer Science (BSc)', specialty: 'IT и технологии', degree: 'Bachelor', language: 'Английский', tuition: 6400, tuitionText: '€6,400/год', start: START.hu, duration: '3 года (6 сем., 180 ECTS)', reqs: REQS.hu, scholarships: SCHOL.hu, url: 'https://www.elte.hu/en/computer-science-bsc' },
  { schoolId: 4376, schoolLabel: 'Corvinus', cc: 'hu', name: 'Бизнес-информатика', en: 'Business Informatics (BSc)', specialty: 'IT и технологии', degree: 'Bachelor', language: 'Английский', tuition: 6600, tuitionText: '€6,600/год', start: START.hu, duration: '3,5 года (7 сем., 210 ECTS)', reqs: REQS.hu, scholarships: SCHOL.hu, url: 'https://corvinus-university.dreamapply.com/courses/course/111-bsc-business-informatics' },
  { schoolId: 4376, schoolLabel: 'Corvinus', cc: 'hu', name: 'Наука о данных в бизнесе', en: 'Data Science in Business (BSc)', specialty: 'IT и технологии', degree: 'Bachelor', language: 'Английский', tuition: 6600, tuitionText: '€6,600/год', start: START.hu, duration: '4 года (8 сем., 240 ECTS)', reqs: REQS.hu, scholarships: SCHOL.hu, url: 'https://corvinus-university.dreamapply.com/courses/course/39-bsc-data-science-business' },

  // ─────────────── АВСТРИЯ ───────────────
  { schoolId: 4237, schoolLabel: 'JKU Linz', cc: 'at', name: 'Искусственный интеллект', en: 'Artificial Intelligence (BSc)', specialty: 'IT и технологии', degree: 'Bachelor', language: 'Английский', tuition: AT_TUITION, tuitionText: AT_TUITION_TEXT, start: START.at, duration: '3 года (6 сем., 180 ECTS)', reqs: REQS.at, scholarships: SCHOL.at, url: 'https://www.jku.at/en/degree-programs/types-of-degree-programs/bachelors-and-diploma-degree-programs/ba-artificial-intelligence/' },
  { schoolId: 4238, schoolLabel: 'Klagenfurt', cc: 'at', name: 'Робототехника и искусственный интеллект', en: 'Robotics and Artificial Intelligence (BSc)', specialty: 'IT и технологии', degree: 'Bachelor', language: 'Английский', tuition: AT_TUITION, tuitionText: AT_TUITION_TEXT, start: START.at, duration: '3 года (6 сем., 180 ECTS)', reqs: REQS.at, scholarships: SCHOL.at, url: 'https://www.aau.at/en/studien/bachelor-robotics-artificial-intelligence/' },
  { schoolId: 4270, schoolLabel: 'FH Kufstein', cc: 'at', name: 'Инженерия дронов (беспилотные системы)', en: 'Drone Engineering (BSc, full-time)', specialty: 'Инженерия', degree: 'Bachelor', language: 'Английский', tuition: AT_TUITION, tuitionText: AT_TUITION_TEXT, start: START.at, duration: '3 года (6 сем., 180 ECTS)', reqs: [...REQS.at, 'Вступительный отбор FH (тест + собеседование)'], scholarships: SCHOL.at, caveat: '100% на английском; 5-й семестр — обучение за рубежом, 6-й — стажировка.', url: 'https://www.fh-kufstein.ac.at/en/bachelor/drone-engineering-ft' },
  { schoolId: 4218, schoolLabel: 'Uni Wien', cc: 'at', name: 'Математические основы науки о данных', en: 'Mathematical Foundations of Data Science (BSc)', specialty: 'IT и технологии', degree: 'Bachelor', language: 'Английский', tuition: AT_TUITION, tuitionText: AT_TUITION_TEXT, start: START.at, duration: '3 года (6 сем., 180 ECTS)', reqs: REQS.at, scholarships: SCHOL.at, caveat: 'Немецкий не требуется (обучение на английском).', url: 'https://aufnahmeverfahren.univie.ac.at/en/mathematical-foundations-of-data-science' },

  // ─────────────── ПОРТУГАЛИЯ ───────────────
  { schoolId: 5400, schoolLabel: 'NOVA IMS', cc: 'pt', name: 'Наука о данных (бакалавр)', en: 'Bachelor in Data Science', specialty: 'IT и технологии', degree: 'Bachelor', language: 'Английский', tuition: 7500, tuitionText: '€7,500/год (не-ЕС)', start: START.pt, duration: '3 года (180 ECTS)', reqs: REQS.pt, scholarships: SCHOL.pt, url: 'https://novaims.unl.pt/en/education/programs/bachelor-s-degrees/data-science/' },

  // ─────────────── ИСПАНИЯ ───────────────
  { schoolId: 5233, schoolLabel: 'UAB', cc: 'es', name: 'Искусственный интеллект', en: 'Bachelor in Artificial Intelligence', specialty: 'IT и технологии', degree: 'Bachelor', language: 'Английский', tuition: 1200, tuitionText: '≈€1,200/год', start: START.es, duration: '4 года (240 ECTS)', reqs: REQS.es, scholarships: SCHOL.es, url: 'https://www.uab.cat/sites/ContentServer/estudiar/ehea-degrees/general-information-1216708259085.html?param1=1345834483501' },
  { schoolId: 5226, schoolLabel: 'UC3M', cc: 'es', name: 'Наука о данных и инженерия', en: 'Data Science and Engineering', specialty: 'IT и технологии', degree: 'Bachelor', language: 'Английский', tuition: 7714, tuitionText: '≈€7,714,20/год (не-ЕС)', start: START.es, duration: '4 года (240 ECTS)', reqs: REQS.es, scholarships: SCHOL.es, caveat: 'Программа полностью на английском (групп на испанском нет).', url: 'https://www.uc3m.es/bachelor-degree/data-science' },
  { schoolId: 5226, schoolLabel: 'UC3M', cc: 'es', name: 'Математика и вычислительная техника', en: 'Mathematics and Computing', specialty: 'IT и технологии', degree: 'Bachelor', language: 'Английский', tuition: 7714, tuitionText: '≈€7,714,20/год (не-ЕС)', start: START.es, duration: '4 года (240 ECTS)', reqs: REQS.es, scholarships: SCHOL.es, caveat: 'Программа полностью на английском (B2 требуется на 1-м курсе).', url: 'https://www.uc3m.es/bachelor-degree/mathematics-computing' },
]

function buildCuratorNote(p: Prog): string {
  const parts: string[] = []
  if (p.caveat) parts.push(p.caveat)
  parts.push(HEDGE[p.cc])
  return parts.join(' ')
}

async function main() {
  console.log(`План: ${PROGRAMS.length} программ (hu/at/pt/es) в существующие вузы\n`)
  let inserted = 0, skipped = 0, missing = 0

  for (const p of PROGRAMS) {
    // Сверяем, что вуз существует
    const { data: school } = await parser.from('schools')
      .select('id, name').eq('id', p.schoolId).maybeSingle()
    if (!school) { console.log(`✗ вуз #${p.schoolId} (${p.schoolLabel}) не найден — пропуск`); missing++; continue }

    const { data: exist } = await parser.from('programs')
      .select('id').eq('school_id', p.schoolId).ilike('name', p.name)
    if (exist && exist.length) {
      skipped++
      console.log(`↺ есть: ${p.schoolLabel} · ${p.name}`)
      continue
    }
    console.log(`＋ ${p.schoolLabel} · ${p.degree} · ${p.name} · ${p.specialty} · ${p.language} · ${p.tuitionText}`)
    if (CONFIRM) {
      const { error } = await parser.from('programs').insert({
        school_id: p.schoolId,
        name: p.name,
        program_description: p.en,
        specialty_group: p.specialty,
        degree_text: p.degree,
        language_text: p.language,
        tuition: p.tuition,
        tuition_text: p.tuitionText,
        start_date_text: p.start,
        deadline_text: p.deadline || DEADLINE[p.cc],
        duration_text: p.duration,
        entry_requirements: p.reqs,
        scholarships_text: p.scholarships ?? null,
        curator_note: buildCuratorNote(p),
        source: 'curator_gh',
        source_url: p.url,
        course_website: p.url,
      })
      if (error) { console.error(`   ✗ вставка: ${error.message}`); process.exit(1) }
    }
    inserted++
  }

  console.log(`\nИтог: программы +${inserted} (пропущено ${skipped}, вузов не найдено ${missing})`)

  if (!CONFIRM) {
    console.log('\n⚠️ dry-run. Ничего не записано. Запусти с --confirm чтобы выполнить.')
    return
  }

  console.log('\n=== Проверка search_programs по странам ===')
  for (const cc of ['hu', 'at', 'pt', 'es']) {
    const { data, error } = await parser.rpc('search_programs', {
      p_country: cc, p_limit: 5, p_offset: 0, p_count_cap: null,
    })
    if (error) console.log(`  ${cc}: RPC error — ${error.message}`)
    else console.log(`  ${cc}: total = ${(data as any)?.total}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
