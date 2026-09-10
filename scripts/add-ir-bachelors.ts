/**
 * Добавить бакалаврские программы по МО/политике для кураторов (в подборки).
 * Источники: 2 ссылки UniBo (6650/6653), PDF «BA in IR 2025» (8 вузов), PDF CEU (2 программы).
 *
 *   npx tsx scripts/add-ir-bachelors.ts            # dry-run (ничего не пишет)
 *   npx tsx scripts/add-ir-bachelors.ts --confirm  # выполнить
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const parser = createClient(process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!, process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const CONFIRM = process.argv.includes('--confirm')

const RAW_BACHELOR = { attributes: { level: 'bachelors' } } // чтобы попадало под фильтр «Бакалавриат»

type Prog = {
  name: string; program_description: string; specialty_group: string
  tuition: number | null; tuition_text: string
  language_text?: string; duration_text?: string; start_date_text?: string; deadline_text?: string
  entry_requirements: string[]; scholarships_text?: string; curator_note: string; source_url?: string
}
const base = (p: Prog, school_id: number) => ({
  school_id,
  name: p.name,
  program_description: p.program_description,
  specialty_group: p.specialty_group,
  degree_text: 'Бакалавриат',
  language_text: p.language_text ?? 'Английский',
  tuition: p.tuition,
  tuition_text: p.tuition_text,
  duration_text: p.duration_text ?? '3 года',
  start_date_text: p.start_date_text ?? 'Сентябрь',
  deadline_text: p.deadline_text ?? null,
  entry_requirements: p.entry_requirements,
  scholarships_text: p.scholarships_text ?? null,
  curator_note: p.curator_note,
  source: 'curator_gh',
  source_url: p.source_url ?? null,
  raw_data: RAW_BACHELOR,
})

const REQ_BASE = ['Школьный аттестат', 'Мотивационное письмо', 'Резюме', 'Скан паспорта']

// --- Вузы, которые уже есть (id из разведки) ---
const EXISTING: { id: number; label: string; progs: Prog[] }[] = [
  { id: 5045, label: 'Università di Bologna', progs: [
    { name: 'Международные исследования (BA International Studies)', program_description: 'Laurea (Bachelor, 180 ECTS) in International Studies — кампус Форли, англ.', specialty_group: 'Социальные науки',
      tuition: 3000, tuition_text: '~€1,500/семестр', duration_text: '3 года', start_date_text: 'Сентябрь 2025', deadline_text: '01.07.2025',
      entry_requirements: ['IELTS 6.5', 'Обязательный вступительный тест TOLC-E EN (02.03–03.05)', ...REQ_BASE],
      curator_note: 'BA International Studies (кампус Форли), англ., 3 года, 180 ECTS. Restricted access — 180 мест. Обязателен тест TOLC-E EN (окно 02.03–03.05). ~€1,500/семестр. Дедлайн 01.07.2025. Erasmus+ мобильность.', source_url: 'https://www.unibo.it/en/study/first-and-single-cycle-degree/programme/2025/6650' },
    { name: 'Европейские исследования (BA European Studies)', program_description: 'Laurea (Bachelor, 180 ECTS) in European Studies — joint degree, обязательная мобильность до 24 мес.', specialty_group: 'Социальные науки',
      tuition: null, tuition_text: 'уточняется', duration_text: '3 года', start_date_text: 'Сентябрь 2025', deadline_text: 'уточняется',
      entry_requirements: ['Английский (обучение полностью на англ.)', 'Второй иностранный язык к выпуску', ...REQ_BASE],
      curator_note: 'BA European Studies — совместная степень 4 европейских вузов, обязательная мобильность до 24 мес. Open access. Междисциплинарно: МО, политика, экономика, стажировки. Стоимость/дедлайн уточняем при заинтересованности.', source_url: 'https://www.unibo.it/en/study/first-and-single-cycle-degree/programme/2025/6653' },
  ]},
  { id: 4387, label: 'University of Pécs', progs: [
    { name: 'Международные отношения (BA International Relations)', program_description: 'BA International Relations — University of Pécs, англ.', specialty_group: 'Социальные науки',
      tuition: 4700, tuition_text: '~€2,350/семестр', deadline_text: '15.07.2025',
      entry_requirements: ['IELTS 5.5', ...REQ_BASE],
      curator_note: 'BA International Relations, англ. ~€2,350/семестр. Дедлайн 15.07.2025. IELTS 5.5.' },
  ]},
  { id: 4376, label: 'Corvinus University of Budapest', progs: [
    { name: 'Международные отношения (BA International Relations)', program_description: 'BA International Relations — Corvinus University of Budapest, англ.', specialty_group: 'Социальные науки',
      tuition: 4800, tuition_text: '~€2,400/семестр', deadline_text: '15.06.2025',
      entry_requirements: ['IELTS 6.5', ...REQ_BASE],
      curator_note: 'BA International Relations, англ. ~€2,400/семестр. Дедлайн 15.06.2025 (может закрыться раньше при переборе мест). IELTS 6.5.' },
  ]},
  { id: 5055, label: 'Università degli Studi di Macerata', progs: [
    { name: 'Международное, европейское и сравнительное право (International, European and Comparative Legal Studies)', program_description: 'BA International, European and Comparative Legal Studies — Macerata, англ.', specialty_group: 'Право',
      tuition: 3000, tuition_text: '~€1,500/семестр', deadline_text: '07.08.2025',
      entry_requirements: ['IELTS 5.5', ...REQ_BASE],
      curator_note: 'BA International, European and Comparative Legal Studies, англ. ~€1,500/семестр. Дедлайн 07.08.2025 (может закрыться раньше при переборе мест). IELTS 5.5.' },
  ]},
  { id: 4320, label: 'Central European University (CEU) — Вена', progs: [
    { name: 'Культура, политика и общество (BA Culture, Politics and Society)', program_description: 'BA Culture, Politics and Society — CEU Вена, двойная степень (Австрия + США), 4 года.', specialty_group: 'Социальные науки',
      tuition: 7000, tuition_text: '€7,000/год', duration_text: '4 года', start_date_text: '1 сентября',
      entry_requirements: ['IELTS 6.5', 'Рекомендательное письмо', 'Эссе 500 слов (важный вызов современности)', 'CEU Application Form', 'Взнос за подачу €30', ...REQ_BASE],
      curator_note: 'BA Culture, Politics and Society, CEU (Вена), 4 года, англ. По выпуску — австрийская + американская степень BA. Majors: Cultural & Historical / Political, Legal & Governmental / Social & Environmental. €7,000/год. Соотношение студенты:преподаватели 7:1. Эссе 500 слов + рек. письмо, взнос €30.' },
    { name: 'Философия, политика и экономика (BA Philosophy, Politics and Economics)', program_description: 'BA Philosophy, Politics and Economics (PPE) — CEU Вена, 4 года.', specialty_group: 'Социальные науки',
      tuition: 7000, tuition_text: '€7,000/год', duration_text: '4 года', start_date_text: '1 сентября',
      entry_requirements: ['IELTS 6.5', 'Рекомендательное письмо', 'Эссе 500 слов (вопрос из философии/политики/экономики)', 'CEU Application Form', 'Взнос за подачу €30', ...REQ_BASE],
      curator_note: 'BA Philosophy, Politics and Economics (PPE), CEU (Вена), 4 года, англ. Междисциплинарно: философия/политика/экономика + треки (МО, публичная политика, социология, бизнес). €7,000/год. Эссе 500 слов + рек. письмо, взнос €30.' },
  ]},
]

// --- Новые вузы (создать) + их программы ---
const NEW: { name: string; city: string; country_code: string; progs: Prog[] }[] = [
  { name: 'Vilnius University', city: 'Вильнюс', country_code: 'lt', progs: [
    { name: 'Политика глобальных вызовов (Politics of Global Challenges)', program_description: 'BA Politics of Global Challenges — Vilnius University, англ.', specialty_group: 'Социальные науки',
      tuition: 2860, tuition_text: '~€1,430/семестр', deadline_text: '25.06.2025',
      entry_requirements: ['IELTS 5.5', ...REQ_BASE],
      curator_note: 'BA Politics of Global Challenges, англ. ~€1,430/семестр. Дедлайн 25.06.2025. IELTS 5.5.' },
  ]},
  { name: 'European Humanities University', city: 'Вильнюс', country_code: 'lt', progs: [
    { name: 'Мировая политика и экономика (World Politics and Economics)', program_description: 'BA World Politics and Economics — European Humanities University (Вильнюс), англ.', specialty_group: 'Социальные науки',
      tuition: 3540, tuition_text: '~€1,770/семестр', deadline_text: 'Rolling deadline',
      entry_requirements: ['IELTS 6.5', ...REQ_BASE],
      curator_note: 'BA World Politics and Economics, англ. ~€1,770/семестр. Rolling deadline (набор по мере поступления). IELTS 6.5.' },
  ]},
  { name: 'Jagiellonian University', city: 'Краков', country_code: 'pl', progs: [
    { name: 'Международные отношения (BA International Relations)', program_description: 'BA International Relations — Jagiellonian University (Краков), англ.', specialty_group: 'Социальные науки',
      tuition: 4500, tuition_text: '~€2,250/семестр', deadline_text: '01.07.2025',
      entry_requirements: ['IELTS 6.5', ...REQ_BASE],
      curator_note: 'BA International Relations, англ. ~€2,250/семестр. Дедлайн 01.07.2025. IELTS 6.5.' },
  ]},
  { name: 'Masaryk University', city: 'Брно', country_code: 'cz', progs: [
    { name: 'Международные отношения и европейская политика (International Relations and European Politics)', program_description: 'BA International Relations and European Politics — Masaryk University (Брно), англ.', specialty_group: 'Социальные науки',
      tuition: 3000, tuition_text: '~€1,500/семестр', deadline_text: '01.07.2025',
      entry_requirements: ['IELTS 6.5', ...REQ_BASE],
      curator_note: 'BA International Relations and European Politics, англ. ~€1,500/семестр. Дедлайн 01.07.2025. IELTS 6.5.' },
  ]},
]

async function ensureProgram(schoolId: number, p: Prog): Promise<'exists' | 'insert'> {
  const { data: ex } = await parser.from('programs').select('id, name').eq('school_id', schoolId).ilike('name', `%${p.name.split('(')[0].trim().slice(0, 12)}%`)
  if (ex?.length) return 'exists'
  if (CONFIRM) {
    const r = await parser.from('programs').insert(base(p, schoolId)).select('id').single()
    if (r.error) throw new Error(`program "${p.name}" @ ${schoolId}: ${r.error.message}`)
  }
  return 'insert'
}

async function main() {
  console.log(CONFIRM ? '=== ВЫПОЛНЕНИЕ (--confirm) ===\n' : '=== DRY-RUN (ничего не пишется) ===\n')

  console.log('--- Существующие вузы: добавляем программы ---')
  for (const s of EXISTING) {
    console.log(`\n[${s.id}] ${s.label}`)
    for (const p of s.progs) {
      const st = await ensureProgram(s.id, p)
      console.log(`   ${st === 'exists' ? '• уже есть' : (CONFIRM ? '✅ вставлено' : '＋ будет добавлено')}: ${p.name}  (${p.specialty_group}, ${p.tuition_text})`)
    }
  }

  console.log('\n--- Новые вузы: создаём + программы ---')
  for (const s of NEW) {
    const { data: exS } = await parser.from('schools').select('id, name').ilike('name', `%${s.name}%`)
    let schoolId: number
    if (exS?.length) { schoolId = exS[0].id; console.log(`\n[${schoolId}] ${s.name} — уже есть`) }
    else if (CONFIRM) {
      const r = await parser.from('schools').insert({ name: s.name, city: s.city, country_code: s.country_code, source: 'curator_gh' }).select('id').single()
      if (r.error) throw new Error(`school "${s.name}": ${r.error.message}`)
      schoolId = r.data.id; console.log(`\n[${schoolId}] ✅ создан вуз: ${s.name} (${s.city}, ${s.country_code})`)
    } else { schoolId = -1; console.log(`\n[NEW] ＋ будет создан вуз: ${s.name} (${s.city}, ${s.country_code})`) }
    for (const p of s.progs) {
      if (schoolId === -1) { console.log(`   ＋ будет добавлено: ${p.name}  (${p.specialty_group}, ${p.tuition_text})`); continue }
      const st = await ensureProgram(schoolId, p)
      console.log(`   ${st === 'exists' ? '• уже есть' : (CONFIRM ? '✅ вставлено' : '＋ будет добавлено')}: ${p.name}`)
    }
  }

  if (!CONFIRM) console.log('\n⚠️ Это dry-run. Запусти с --confirm чтобы записать в базу.')
  else console.log('\nГотово. Программы помечены source=curator_gh (легко откатить при необходимости).')
}
main().catch(e => { console.error(e); process.exit(1) })
