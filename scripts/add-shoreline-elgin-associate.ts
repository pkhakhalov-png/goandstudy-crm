/**
 * Каталог: добавить переводные associate-степени двух комьюнити-колледжей (США).
 *   1) Shoreline Community College (#530, уже в базе) — Associate of Arts – Direct
 *      Transfer Agreement (AA-DTA).
 *   2) Elgin Community College (ECC) — создать вуз + Associate in Arts (AA) и
 *      Associate in Science (AS).
 *
 * Данные сверены по официальным страницам (июль 2026):
 *   Shoreline: междунар. tuition $11,283/год (3 четв. × 15 кред., $3,761/четв.),
 *              COA $24,963/год, AA-DTA = 90 кредитов, перевод в вузы WA.
 *   Elgin:     out-of-state/F-1 tuition $9,516/год ($396/кредит-час), COA ~$23,625/год,
 *              AA/AS = 60 кредитов, перевод по IAI (UIC, UIUC, UW-Madison, ASU).
 *
 *   npx tsx scripts/add-shoreline-elgin-associate.ts            # dry-run
 *   npx tsx scripts/add-shoreline-elgin-associate.ts --confirm  # выполнить
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const parser = createClient(process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!, process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const CONFIRM = process.argv.includes('--confirm')
const SHORELINE_ID = 530

const shorelineAADTA = {
  school_id: SHORELINE_ID,
  name: 'Associate of Arts – Direct Transfer Agreement (AA-DTA)',
  program_description: 'Переводная степень (transfer degree): первые 2 года бакалавриата в Shoreline с гарантированным переводом на 3-й курс в вузы штата Вашингтон.',
  specialty_group: 'Другое',
  degree_text: 'Associate',
  language_text: 'Английский',
  tuition: 11283,
  tuition_text: '~$11,283/год (междунар.; 3 четверти × 15 кредитов, $3,761/четверть)',
  start_date_text: 'Сентябрь / Январь / Апрель / Июнь (по четвертям)',
  deadline_text: 'за ~1–2 мес. до начала четверти',
  duration_text: '~2 года (90 кредитов)',
  living_cost_text: '~$1,000–1,400',
  living_cost_period: 'в месяц',
  entry_requirements: [
    'Аттестат о среднем образовании',
    'Английский: IELTS 5.5–6.0 / TOEFL iBT 61–70 (или ESL-программа колледжа)',
    'Финансовое подтверждение ~$24,963 на первый год (COA)',
  ],
  accommodation_options: ['Резиденция кампуса / студенческие общежития', 'Homestay (принимающая семья)', 'Частная аренда в районе Сиэтла'],
  scholarships_text: 'Частичные merit-стипендии для международных студентов',
  curator_note: 'Shoreline Community College (пригород Сиэтла, шт. Вашингтон). AA-DTA — общая переводная степень на 90 кредитов (~2 года): закрывает первые 2 курса бакалавриата и по Direct Transfer Agreement переводится в вузы штата Вашингтон (UW и др.) сразу на 3-й курс. Междунар. tuition $11,283/год, полная стоимость обучения+проживания ~$24,963/год. Старт по четвертям (осень/зима/весна/лето). Цифры сверены по shoreline.edu (июль 2026), точные суммы/дедлайны уточняем при заинтересованности.',
  source: 'curator_gh',
}

const elginSchool = {
  name: 'Elgin Community College (ECC)',
  city: 'Elgin, IL',
  country_code: 'us',
  university_type: 'Государственный',
  qs_rank: null as number | null,
  curator_note: 'Государственный комьюнити-колледж в пригороде Чикаго (Элгин, шт. Иллинойс). Переводные associate-степени по системе Illinois Articulation Initiative (IAI): модель 2+2 — первые 2 года бакалавриата в ECC с переводом в 4-летние вузы (UIC, University of Illinois Urbana-Champaign, а также UW–Madison, Arizona State). Out-of-state / F-1 tuition $9,516/год ($396/кредит-час).',
  source: 'curator_gh',
}

const elginCommon = {
  degree_text: 'Associate',
  language_text: 'Английский',
  specialty_group: 'Другое',
  tuition: 9516,
  tuition_text: '~$9,516/год (out-of-state / F-1; $396/кредит-час)',
  start_date_text: 'Август / Январь / Июнь (Fall / Spring / Summer)',
  deadline_text: 'за ~1–2 мес. до начала семестра',
  duration_text: '~2 года (60 кредитов)',
  living_cost_text: '~$1,000–1,300',
  living_cost_period: 'в месяц',
  entry_requirements: [
    'Аттестат о среднем образовании',
    'Английский: IELTS 6.0 / TOEFL iBT ~71 / Duolingo (или ESL)',
    'Финансовое подтверждение (COA ~$23,625/год)',
  ],
  accommodation_options: ['У ECC нет кампусных общежитий — частная аренда рядом с колледжем', 'Homestay (принимающая семья)'],
  scholarships_text: 'Ограниченные стипендии/скидки для международных студентов',
  source: 'curator_gh',
}

const elginAA = (schoolId: number) => ({
  school_id: schoolId,
  name: 'Associate in Arts (AA)',
  program_description: 'Переводная степень (гуманитарные / социальные науки): первые 2 года бакалавриата с переводом в 4-летние вузы по системе IAI.',
  curator_note: 'Associate in Arts (AA), ECC — общая переводная степень на 60 кредитов (~2 года) с уклоном в гуманитарные и социальные науки. Переводится в вузы Иллинойса по IAI (2+2). Tuition $9,516/год (out-of-state/F-1). Цифры сверены по elgin.edu / catalog.elgin.edu (июль 2026), точные суммы/дедлайны уточняем при заинтересованности.',
  ...elginCommon,
})

const elginAS = (schoolId: number) => ({
  school_id: schoolId,
  name: 'Associate in Science (AS)',
  program_description: 'Переводная степень (естественные / точные науки): первые 2 года бакалавриата с переводом в 4-летние вузы по системе IAI.',
  curator_note: 'Associate in Science (AS), ECC — общая переводная степень на 60 кредитов (~2 года) с уклоном в естественные и точные науки (подходит под STEM-бакалавриаты). Переводится в вузы Иллинойса по IAI (2+2). Tuition $9,516/год (out-of-state/F-1). Цифры сверены по elgin.edu / catalog.elgin.edu (июль 2026), точные суммы/дедлайны уточняем при заинтересованности.',
  ...elginCommon,
})

async function main() {
  // --- 1. Shoreline AA-DTA (не дублируем) ---
  const { data: existShore } = await parser.from('programs')
    .select('id, name').eq('school_id', SHORELINE_ID).ilike('name', '%direct transfer agreement%')
  console.log(existShore?.length ? `⚠️ Shoreline AA-DTA уже есть: ${JSON.stringify(existShore)}` : 'Shoreline AA-DTA — вставим:')
  if (!existShore?.length) console.log(JSON.stringify(shorelineAADTA, null, 2))

  // --- 2. Elgin школа ---
  const { data: existElgin } = await parser.from('schools').select('id, name').ilike('name', '%elgin%')
  console.log('\n' + (existElgin?.length ? `⚠️ Elgin школа уже есть: ${JSON.stringify(existElgin)}` : 'Elgin CC — создадим школу + AA + AS:'))
  if (!existElgin?.length) console.log(JSON.stringify(elginSchool, null, 2))

  if (!CONFIRM) { console.log('\n⚠️ dry-run. Запусти с --confirm чтобы выполнить.'); return }

  // 1) Shoreline AA-DTA
  if (!existShore?.length) {
    const r = await parser.from('programs').insert(shorelineAADTA).select('id, name, school_id').single()
    if (r.error) { console.error('SHORELINE INSERT ERR:', r.error.message); process.exit(1) }
    console.log('✅ Shoreline AA-DTA вставлен:', JSON.stringify(r.data))
  }

  // 2) Elgin школа
  let elginId: number
  if (existElgin?.length) {
    elginId = existElgin[0].id
  } else {
    const r = await parser.from('schools').insert(elginSchool).select('id, name').single()
    if (r.error) { console.error('ELGIN SCHOOL INSERT ERR:', r.error.message); process.exit(1) }
    elginId = r.data.id
    console.log('✅ Elgin школа создана:', JSON.stringify(r.data))
  }

  // 3) Elgin AA + AS (не дублируем по имени)
  for (const build of [elginAA, elginAS]) {
    const prog = build(elginId)
    const { data: exist } = await parser.from('programs').select('id').eq('school_id', elginId).eq('name', prog.name)
    if (exist?.length) { console.log(`⚠️ "${prog.name}" уже есть — пропуск`); continue }
    const r = await parser.from('programs').insert(prog).select('id, name, school_id').single()
    if (r.error) { console.error(`ELGIN "${prog.name}" INSERT ERR:`, r.error.message); process.exit(1) }
    console.log(`✅ ${prog.name} вставлен:`, JSON.stringify(r.data))
  }

  // --- verify ---
  const { data: shoreRows } = await parser.from('programs').select('id, name, degree_text, tuition_text').eq('school_id', SHORELINE_ID).ilike('name', '%direct transfer agreement%')
  console.log('\nShoreline AA-DTA в базе:', JSON.stringify(shoreRows))
  const { data: elginRows } = await parser.from('programs').select('id, name, degree_text, tuition_text').eq('school_id', elginId)
  console.log('Elgin программы в базе:', JSON.stringify(elginRows, null, 2))
}
main().catch(e => { console.error(e); process.exit(1) })
