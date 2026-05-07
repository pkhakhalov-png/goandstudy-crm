/**
 * Создаёт ДЕМО-клиента: demo@goandstudy.com / demo2026.
 * Лид может зайти и посмотреть как выглядит ЛК, тур запускается каждый вход.
 *
 * Заполняет:
 *  — clients (Демо Клиент, проект-data, roadmap, current_stage)
 *  — 7 client_universities (3 страны, разные ранки) с реальными school_id из parser
 *  — 3 client_scholarships (раскрытые)
 *  — ~12 client_activities за последний месяц
 *  — 2 client_essays (resume sent, motivation approved)
 *  — несколько client_documents (uploaded)
 *
 * Запуск:
 *   npx tsx scripts/seed-demo-client.ts                # создать
 *   npx tsx scripts/seed-demo-client.ts --reset        # очистить и пересоздать
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const DEMO_EMAIL = 'demo@goandstudy.com'
const DEMO_PASSWORD = 'demo2026'
const DEMO_NAME = 'Демо Клиент'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)
const sbParser = createClient(
  process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!,
  process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

async function findExistingDemo(): Promise<number | null> {
  const { data } = await sb.from('clients').select('id').eq('email', DEMO_EMAIL).maybeSingle()
  return data?.id || null
}

async function deleteDemo(clientId: number) {
  console.log(`Чищу старые данные клиента id=${clientId}…`)
  const tables = [
    'client_applications', 'client_activities', 'client_essays', 'client_documents',
    'client_universities', 'client_scholarships', 'client_stages',
    'client_invitations', 'client_checklist_progress',
  ]
  for (const t of tables) await sb.from(t).delete().eq('client_id', clientId)
  await sb.from('clients').delete().eq('id', clientId)
}

async function ensureAuthUser(): Promise<string> {
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const existing = list?.users.find(u => u.email === DEMO_EMAIL)
  if (existing) {
    // Сбросим пароль на demo2026 на случай если меняли
    await sb.auth.admin.updateUserById(existing.id, { password: DEMO_PASSWORD })
    return existing.id
  }
  const { data, error } = await sb.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`auth.users: ${error?.message}`)
  return data.user.id
}

async function ensurePublicUser(authId: string) {
  const { data: existing } = await sb.from('users').select('id').eq('id', authId).maybeSingle()
  if (existing) {
    await sb.from('users').update({ role: 'client', name: DEMO_NAME, email: DEMO_EMAIL }).eq('id', authId)
  } else {
    await sb.from('users').insert({ id: authId, email: DEMO_EMAIL, role: 'client', name: DEMO_NAME })
  }
}

async function pickFirstCurator(): Promise<string | null> {
  const { data } = await sb.from('curators').select('id').limit(1).maybeSingle()
  return data?.id || null
}

async function pickFirstSalesperson(): Promise<string | null> {
  const { data } = await sb.from('users').select('id').eq('role', 'salesperson').limit(1).maybeSingle()
  return data?.id || null
}

const DEMO_PROJECT_DATA = {
  child_name: 'Алексей Демо',
  child_age: '17',
  current_grade: '11 класс',
  target_country: 'Великобритания / Канада',
  target_specialty: 'Computer Science',
  budget_per_year: '£25,000',
  language_level: 'IELTS 7.0',
  ielts_score: '7.0',
  toefl_score: null,
  gpa: '4.7',
  motivation: 'Хочет работать в tech, мечтает о Google/DeepMind. Сильная математика и олимпиады.',
  extracurricular: 'Школьная команда по робототехнике, призёр All-Russian Math Olympiad 2025',
  parent_concerns: 'Ищем сбалансированную программу — не только теория, но и стажировки.',
  decision_makers: 'Родители + сам ребёнок принимают решение совместно',
}

const DEMO_ROADMAP_DATA = {
  stages: [
    {
      key: 'stage1',
      title: 'Знакомство и оценка',
      items: [
        { key: 'i1', title: 'Стратегическая сессия', done: true },
        { key: 'i2', title: 'Анализ профиля и оценка шансов', done: true },
      ],
    },
    {
      key: 'stage2',
      title: 'Подбор программ',
      items: [
        { key: 'i3', title: 'Подобрать 7-10 программ', done: true },
        { key: 'i4', title: 'Утвердить финальный список', done: true },
      ],
    },
    {
      key: 'stage3',
      title: 'Документы',
      items: [
        { key: 'i5', title: 'Резюме (CV)', done: true },
        { key: 'i6', title: 'Мотивационное письмо', done: true },
        { key: 'i7', title: 'Транскрипты школы', done: false },
      ],
    },
  ],
  sent_at: new Date(Date.now() - 14 * 24 * 3600e3).toISOString(),
  sent_by_name: 'Анна Куратор',
}

// 7 программ из parser DB у которых УЖЕ есть данные от ИИ (qs / description /
// curator_note / program_curator_data). Демо открывается на reach-страницы
// без необходимости вызывать ИИ заново.
const SHORTLIST: Array<{
  schoolId: number; programId: number;
  schoolName: string; programName: string; country: string; city: string;
  tuition: number | null; currency: string | null; priority: number | null;
}> = [
  // Топ-3 (приоритетные)
  { schoolId: 4218, programId: 427914, schoolName: 'Universität Wien',                country: 'Австрия',         city: 'Вена',     programName: 'Бизнес и управление',                                    tuition: null, currency: null,  priority: 1 },
  { schoolId: 2639, programId: 359238, schoolName: 'Lancaster University - Leipzig',  country: 'Германия',        city: 'Лейпциг',  programName: '2 Semester Business Foundation + BSc Business Analytics', tuition: 14000, currency: 'EUR', priority: 2 },
  { schoolId: 4235, programId: 427952, schoolName: 'Universität Innsbruck (UIBK)',    country: 'Австрия',         city: 'Инсбрук',  programName: 'Бизнес и управление',                                    tuition: null, currency: null,  priority: 3 },
  // Резерв
  { schoolId: 2639, programId: 359231, schoolName: 'Lancaster University - Leipzig',  country: 'Германия',        city: 'Лейпциг',  programName: '3 Semester Business Foundation + BSc Accounting and Finance', tuition: 14000, currency: 'EUR', priority: null },
  { schoolId: 4239, programId: 427966, schoolName: 'Universität für Weiterbildung Krems', country: 'Австрия',     city: 'Кремс',    programName: 'Бизнес и управление',                                    tuition: null, currency: null,  priority: null },
  { schoolId: 1527, programId: 280866, schoolName: 'Bournemouth University - Talbot Campus', country: 'Великобритания', city: 'Борнмут', programName: 'BA (Hons) Business and Management',                tuition: null, currency: null,  priority: null },
  { schoolId: 3837, programId: 426886, schoolName: 'SP Jain School of Global Management', country: 'ОАЭ',         city: 'Дубай',    programName: 'IT и технологии',                                       tuition: null, currency: null,  priority: null },
]

// Реальные IDP scholarship_ids из scholarships DB чтоб клик «к деталям» работал
const SCHOLARSHIPS = [
  { kind: 'idp', scholarshipId: 3085, title: 'Edinburgh Global Undergraduate Mathematics Scholarships', institution: 'University of Edinburgh', amountText: '£5,000 / год', deadline: '2026-03-31' },
  { kind: 'idp', scholarshipId: 3428, title: 'Rosedale OSSD University of Edinburgh Scholarship',       institution: 'University of Edinburgh', amountText: '£10,000 / год', deadline: '2026-04-30' },
  { kind: 'idp', scholarshipId: 3619, title: "Haworth Charitable Trust Manchester's Artist Community Studio Space Scholarship", institution: 'University of Manchester', amountText: '£8,000 / год', deadline: null },
]

async function seedShortlist(clientId: number) {
  console.log('Сидую подборку…')
  for (const u of SHORTLIST) {
    const notes = JSON.stringify({ school_id: u.schoolId, program_id: u.programId })
    await sb.from('client_universities').insert({
      client_id: clientId,
      university_name: u.schoolName,
      program_name: u.programName,
      country: u.country,
      city: u.city,
      tuition_per_year: u.tuition,
      currency: u.currency,
      priority: u.priority,
      status: 'planned',
      notes,
    })
  }
}

async function seedScholarships(clientId: number) {
  console.log('Сидую стипендии…')
  for (const s of SCHOLARSHIPS) {
    await sb.from('client_scholarships').insert({
      client_id: clientId,
      kind: s.kind,
      scholarship_id: s.scholarshipId,
      scholarship_title: s.title,
      institution_title: s.institution,
      amount_text: s.amountText,
      deadline: s.deadline,
      status: 'preparing',
      unlocked_for_client: true,
    })
  }
}

async function seedActivities(clientId: number) {
  console.log('Сидую activity-feed…')
  const events = [
    { days: 30, type: 'stage_change',     content: 'Куратор Анна назначена сопровождающим' },
    { days: 28, type: 'note',             content: 'Стратегическая сессия проведена. Зафиксирован профиль и цели.' },
    { days: 25, type: 'project_field_filled', content: 'Куратор заполнил поле «Цели и мотивация» в проекте студента' },
    { days: 24, type: 'project_confirmed', content: 'Профиль студента утверждён — переходим к подбору программ' },
    { days: 20, type: 'shortlist_added',  content: 'Куратор добавил вуз: Universität Wien — Бизнес и управление' },
    { days: 19, type: 'shortlist_added',  content: 'Куратор добавил вуз: Lancaster University Leipzig — BSc Business Analytics' },
    { days: 18, type: 'shortlist_added',  content: 'Куратор добавил вуз: Universität Innsbruck (UIBK) — Бизнес и управление' },
    { days: 17, type: 'shortlist_published', content: 'Подборка из 7 программ отправлена клиенту' },
    { days: 14, type: 'roadmap_sent',     content: 'Куратор отправил дорожную карту на согласование' },
    { days: 13, type: 'roadmap_approved', content: 'Клиент утвердил дорожную карту' },
    { days: 10, type: 'scholarship_added', content: 'Раскрыта стипендия Edinburgh Global Undergraduate Mathematics Scholarships (£5,000/год)' },
    { days: 8,  type: 'essay_approved',    content: 'Резюме (CV) утверждено куратором' },
    { days: 7,  type: 'essay_approved',    content: 'Мотивационное письмо утверждено куратором' },
    { days: 5,  type: 'note',              content: 'Запрошены транскрипты школы — нужны сканы за 10-11 классы' },
    { days: 2,  type: 'application_created', content: 'Создана заявка в Universität Wien' },
  ]
  for (const e of events) {
    const t = new Date(Date.now() - e.days * 24 * 3600e3).toISOString()
    await sb.from('client_activities').insert({
      client_id: clientId,
      activity_type: e.type,
      content: e.content,
      created_at: t,
    })
  }
}

async function seedEssays(clientId: number) {
  console.log('Сидую эссе…')

  // Mock-letter в правильной структуре MotivationLetter
  const motivationLetter = {
    authorName: 'Алексей Демо',
    whyApplying:
      'Я подаюсь на программу «Бизнес и управление» в Universität Wien, потому что хочу строить международную карьеру в управлении технологическими компаниями. Старейший университет немецкоязычного мира, сильная школа экономики и контакт с европейским tech-рынком — то, что мне нужно.',
    whyInterest:
      'Мой интерес к бизнесу начался с собственного pet-проекта в 10 классе — я организовал онлайн-репетиторство по математике для младших школьников и довёл оборот до 80 000 ₽/мес. Это показало мне, насколько интересно превращать идею в работающий продукт.',
    whySuitable:
      'IELTS 7.0, GPA 4.7, призёр All-Russian Math Olympiad 2025, опыт лидерства в школьной команде по робототехнике. Имею собственный успешный микро-бизнес. Готов к нагрузке европейского университета.',
    studiesRelated:
      'В 10-11 классах углублённо изучал алгебру, мат-анализ, экономику. Прошёл онлайн-курс «Foundations of Business Strategy» от Coursera. Школьный проект — анализ unit-экономики моего репетиторского проекта. Всё это напрямую готовит к выбранной программе.',
    skills:
      'Аналитическое мышление, базовое знание Excel и SQL, опыт презентаций, английский C1, немецкий A2 (учу). Умею читать финансовые отчёты, провожу cohort-анализ когорт своих учеников.',
    otherAchievements:
      'Капитан школьной команды по робототехнике (3 место в RoboCup Junior 2025). Запустил math-club для младших классов. Прошёл за 4 месяца от 0 до 80k ₽/мес операционной прибыли в своём репетиторском проекте.',
    workExperience:
      'Основатель и оператор онлайн-репетиторской платформы (2024–2025) — 12 учеников, 80k ₽/мес. Стажировался 2 месяца в локальной IT-компании летом 2025 — писал автотесты на Python. Участвовал в школьном бизнес-кейс-чемпионате (2 место).',
    futurePlans:
      'После бакалавриата планирую магистратуру по management (WU Vienna / IE Business School / HEC Paris) и работу в стратегическом консалтинге или product-management в tech. В долгосрочной перспективе — собственная edtech-компания на европейском рынке.',
  }

  await sb.from('client_essays').insert([
    {
      client_id: clientId,
      type: 'resume',
      content: null,
      curator_content: null,
      status: 'draft',
      last_updated_at: new Date(Date.now() - 8 * 24 * 3600e3).toISOString(),
    },
    {
      client_id: clientId,
      type: 'motivation',
      content: motivationLetter,
      curator_content: motivationLetter,
      status: 'approved',
      submitted_at: new Date(Date.now() - 8 * 24 * 3600e3).toISOString(),
      approved_at: new Date(Date.now() - 7 * 24 * 3600e3).toISOString(),
      last_updated_at: new Date(Date.now() - 7 * 24 * 3600e3).toISOString(),
    },
  ])
}

async function main() {
  const reset = process.argv.includes('--reset')

  const existingId = await findExistingDemo()
  if (existingId && !reset) {
    console.log(`Демо-клиент уже есть (id=${existingId}). Запусти с --reset чтобы пересоздать.`)
    return
  }
  if (existingId && reset) {
    await deleteDemo(existingId)
  }

  console.log('1. auth.users…')
  const authId = await ensureAuthUser()
  console.log(`   ${authId}`)

  console.log('2. public.users…')
  await ensurePublicUser(authId)

  console.log('3. clients…')
  const curatorId = await pickFirstCurator()
  const salespersonId = await pickFirstSalesperson()
  const baseInsert: any = {
    name: DEMO_NAME,
    email: DEMO_EMAIL,
    country: 'Великобритания',
    status: 'active',
    curator_id: curatorId,
    salesperson_id: salespersonId,
    first_payment_date: new Date(Date.now() - 30 * 24 * 3600e3).toISOString().slice(0, 10),
    // Стадия — Подача (7/12). Этапы 1-6 «done», текущий — Подача
    current_stage_code: 'applications',
    project_data: DEMO_PROJECT_DATA,
    roadmap_data: DEMO_ROADMAP_DATA,
    roadmap_approved_at: new Date(Date.now() - 13 * 24 * 3600e3).toISOString(),
    roadmap_approved_by_name: 'Алексей Демо',
    onboarded: false,
  }
  const { data: client, error: cErr } = await sb.from('clients').insert(baseInsert).select('id').single()
  if (cErr) throw new Error(cErr.message)
  const clientId = client!.id
  console.log(`   id=${clientId}`)

  await seedShortlist(clientId)
  await seedScholarships(clientId)
  await seedEssays(clientId)
  await seedActivities(clientId)

  console.log('\n✅ Демо-клиент готов:')
  console.log(`   email:    ${DEMO_EMAIL}`)
  console.log(`   password: ${DEMO_PASSWORD}`)
  console.log(`   client id: ${clientId}`)
  console.log('\nЗаход: https://crm.goandstudy.com/login → demo@goandstudy.com / demo2026')
}
main().catch(e => { console.error(e); process.exit(1) })
