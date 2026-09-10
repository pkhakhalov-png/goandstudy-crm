/**
 * 1) Сделать Heidelberg находимым по "Heidelberg University" (переименовать #3898).
 * 2) Добавить #3898 программу MSc International Health.
 * 3) Создать вуз-консорциум Eu-HEM (Erasmus Mundus, Австрия + Италия) + программу.
 *
 *   npx tsx scripts/add-heidelberg-euhem.ts            # dry-run
 *   npx tsx scripts/add-heidelberg-euhem.ts --confirm  # выполнить
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const parser = createClient(process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!, process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const CONFIRM = process.argv.includes('--confirm')
const HEIDELBERG_ID = 3898
const HEIDELBERG_NEW_NAME = 'Heidelberg University (Ruprecht-Karls-Universität)'

const intHealth = {
  school_id: HEIDELBERG_ID,
  name: 'Международное здравоохранение (MSc International Health)',
  program_description: 'MSc International Health — Heidelberg Institute of Global Health (сеть tropEd)',
  specialty_group: 'Медицина и здоровье',
  degree_text: 'Master',
  language_text: 'Английский',
  tuition: 7900,
  tuition_text: '~€7,900 (full-time)',
  start_date_text: 'Октябрь/Ноябрь',
  deadline_text: 'Апрель–Июнь',
  duration_text: '12 мес. full-time (или модульно до 5 лет)',
  living_cost_text: '€900–1200',
  living_cost_period: 'в месяц',
  entry_requirements: ['Диплом в области здоровья/медицины/смежное', 'Обычно 1–2 года проф. опыта в здравоохранении', 'Английский B2 (IELTS 6.0+)'],
  accommodation_options: ['Studierendenwerk Heidelberg', 'частная аренда Гейдельберг'],
  scholarships_text: 'DAAD · Heidelberg / HIGH scholarships',
  curator_note: 'MSc International Health от Heidelberg Institute of Global Health (сеть tropEd). Фокус: глобальное здоровье, эпидемиология, менеджмент систем здравоохранения. Full-time ~12 мес. или модульно (можно растянуть до 5 лет). Обычно требуется проф. опыт в здравоохранении. Точную стоимость и дедлайны уточняем при заинтересованности.',
  source: 'curator_gh',
}

const euhemSchool = {
  name: 'Eu-HEM — European Master in Health Economics & Management',
  city: 'Innsbruck / Bologna',
  country_code: 'at',
  university_type: 'Erasmus Mundus',
  qs_rank: null as number | null,
  curator_note: 'Erasmus Mundus совместная магистратура (EMJM). Консорциум вузов: Австрия — MCI Innsbruck, Италия — University of Bologna, плюс Erasmus University Rotterdam и University of Oslo. Соглашение между вузами, поэтому отдельного «вуза» в базе нет — заведён как консорциум.',
  source: 'curator_gh',
}

const euhemProgram = (schoolId: number) => ({
  school_id: schoolId,
  name: 'Экономика и менеджмент здравоохранения (Eu-HEM)',
  program_description: 'European Master in Health Economics & Management — Erasmus Mundus (Австрия + Италия)',
  specialty_group: 'Медицина и здоровье',
  degree_text: 'Master',
  language_text: 'Английский',
  tuition: 9000,
  tuition_text: '~€8,000–9,000/год (self-funded)',
  start_date_text: 'Сентябрь',
  deadline_text: 'Январь–Март',
  duration_text: '2 года (4 семестра, мобильность между вузами)',
  living_cost_text: '€900–1300',
  living_cost_period: 'в месяц',
  entry_requirements: ['Первый диплом (экономика/менеджмент/здоровье/смежное)', 'Английский B2 (IELTS 6.5+)', 'мотивационное письмо + CV'],
  accommodation_options: ['общежития вузов-партнёров', 'частная аренда'],
  scholarships_text: 'Erasmus Mundus (EMJM) стипендии — покрывают обучение + стипендия на проживание',
  curator_note: 'Erasmus Mundus European Master in Health Economics & Management. Мобильность между вузами-партнёрами (Австрия — MCI Innsbruck, Италия — University of Bologna, плюс Rotterdam / Oslo). Соглашение между вузами → отдельного вуза в базе нет. Есть стипендии Erasmus Mundus (покрывают обучение + проживание). Точную стоимость/дедлайны и состав трека уточняем при заинтересованности.',
  source: 'curator_gh',
})

async function main() {
  // --- 1. Heidelberg rename ---
  const { data: heid } = await parser.from('schools').select('id, name').eq('id', HEIDELBERG_ID).single()
  console.log(`Heidelberg #${HEIDELBERG_ID}: "${heid?.name}" → "${HEIDELBERG_NEW_NAME}"`)

  // --- 2. MSc International Health (не дублируем) ---
  const { data: existIH } = await parser.from('programs')
    .select('id, name').eq('school_id', HEIDELBERG_ID).or('name.ilike.%international health%,name.ilike.%международн%здрав%')
  console.log(existIH?.length ? `⚠️ MSc International Health уже есть: ${JSON.stringify(existIH)}` : 'MSc International Health — вставим:')
  if (!existIH?.length) console.log(JSON.stringify(intHealth, null, 2))

  // --- 3. Eu-HEM ---
  const { data: existEu } = await parser.from('schools').select('id, name').ilike('name', '%eu-hem%')
  console.log(existEu?.length ? `⚠️ Eu-HEM школа уже есть: ${JSON.stringify(existEu)}` : 'Eu-HEM консорциум — создадим школу + программу:')
  if (!existEu?.length) console.log(JSON.stringify(euhemSchool, null, 2))

  if (!CONFIRM) { console.log('\n⚠️ dry-run. Запусти с --confirm чтобы выполнить.'); return }

  // 1) rename
  const r1 = await parser.from('schools').update({ name: HEIDELBERG_NEW_NAME }).eq('id', HEIDELBERG_ID)
  if (r1.error) { console.error('RENAME ERR:', r1.error.message); process.exit(1) }
  console.log('✅ Heidelberg переименован')

  // 2) int health
  if (!existIH?.length) {
    const r2 = await parser.from('programs').insert(intHealth).select('id, name').single()
    if (r2.error) { console.error('IH INSERT ERR:', r2.error.message); process.exit(1) }
    console.log('✅ MSc International Health вставлен:', JSON.stringify(r2.data))
  }

  // 3) eu-hem school + program
  let euSchoolId: number
  if (existEu?.length) {
    euSchoolId = existEu[0].id
  } else {
    const r3 = await parser.from('schools').insert(euhemSchool).select('id, name').single()
    if (r3.error) { console.error('EU SCHOOL INSERT ERR:', r3.error.message); process.exit(1) }
    euSchoolId = r3.data.id
    console.log('✅ Eu-HEM школа создана:', JSON.stringify(r3.data))
  }
  const { data: existEuProg } = await parser.from('programs').select('id').eq('school_id', euSchoolId).ilike('name', '%eu-hem%')
  if (!existEuProg?.length) {
    const r4 = await parser.from('programs').insert(euhemProgram(euSchoolId)).select('id, name, school_id').single()
    if (r4.error) { console.error('EU PROG INSERT ERR:', r4.error.message); process.exit(1) }
    console.log('✅ Eu-HEM программа вставлена:', JSON.stringify(r4.data))
  }

  // --- verify via catalog RPC ---
  const { data: hRpc } = await parser.rpc('search_programs', { p_school_id: HEIDELBERG_ID, p_specialty: 'Медицина и здоровье', p_levels: ['master'], p_limit: 24, p_offset: 0, p_count_cap: null })
  console.log('\nHeidelberg / Медицина&здоровье / master total:', (hRpc as any)?.total)
  console.log('rows:', JSON.stringify(((hRpc as any)?.rows ?? []).map((r: any) => ({ id: r.id, name: r.name }))))
  const { data: eRpc } = await parser.rpc('search_programs', { p_school_id: euSchoolId, p_specialty: null, p_levels: null, p_limit: 24, p_offset: 0, p_count_cap: null })
  console.log('Eu-HEM school total:', (eRpc as any)?.total)
  console.log('rows:', JSON.stringify(((eRpc as any)?.rows ?? []).map((r: any) => ({ id: r.id, name: r.name }))))
}
main().catch(e => { console.error(e); process.exit(1) })
