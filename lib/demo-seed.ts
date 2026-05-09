/**
 * Сидинг демо-клиента — переиспользуется и в скрипте (scripts/seed-demo-client.ts),
 * и в часовом cron-резете (app/api/cron/reset-demo).
 *
 * Контракт: функция resetDemoClient выносит всю логику.
 *  — auth.users + public.users (создаёт если нет, оставляет если есть)
 *  — clients (удаляет старого demo + создаёт нового)
 *  — связанные таблицы (universities/scholarships/essays/activities)
 *
 * Демо изолирован: curator_id=null, salesperson_id=любой существующий.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const DEMO_EMAIL = 'demo@goandstudy.com'
export const DEMO_PASSWORD = 'demo2026'
export const DEMO_NAME = 'Демо Клиент'

const DEMO_PROJECT_DATA = {
  child_name: 'Алексей Демо',
  child_age: '17',
  current_grade: '11 класс',
  target_country: 'Австрия / Германия',
  target_specialty: 'Бизнес и управление',
  budget_per_year: '€15,000',
  language_level: 'IELTS 7.0 / Deutsch A2',
  ielts_score: '7.0',
  toefl_score: null,
  gpa: '4.7',
  motivation: 'Хочет строить международную карьеру в management в tech. Pet-проект — онлайн-репетиторство, оборот 80k ₽/мес.',
  extracurricular: 'Капитан робототехники (3 место RoboCup Junior 2025), призёр All-Russian Math Olympiad 2025, math-club для младших',
  parent_concerns: 'Хотим программу с сильной экономикой + стажировками. Бюджет до €15k/год.',
  decision_makers: 'Родители + сам ребёнок принимают решение совместно',
}

const DEMO_ROADMAP_DATA = {
  stages: [
    {
      key: 'stage1', title: 'Знакомство и оценка',
      items: [
        { key: 'i1', title: 'Стратегическая сессия', done: true },
        { key: 'i2', title: 'Анализ профиля и оценка шансов', done: true },
      ],
    },
    {
      key: 'stage2', title: 'Подбор программ',
      items: [
        { key: 'i3', title: 'Подобрать 7-10 программ', done: true },
        { key: 'i4', title: 'Утвердить финальный список', done: true },
      ],
    },
    {
      key: 'stage3', title: 'Документы',
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

// 7 программ с УЖЕ заполненными ИИ данными в parser DB
const SHORTLIST = [
  { schoolId: 4218, programId: 427914, schoolName: 'Universität Wien',                           country: 'Австрия',         city: 'Вена',     programName: 'Бизнес и управление',                                          tuition: null,  currency: null,  priority: 1 },
  { schoolId: 2639, programId: 359238, schoolName: 'Lancaster University - Leipzig',             country: 'Германия',        city: 'Лейпциг',  programName: '2 Semester Business Foundation + BSc Business Analytics',     tuition: 14000, currency: 'EUR', priority: 2 },
  { schoolId: 4235, programId: 427952, schoolName: 'Universität Innsbruck (UIBK)',               country: 'Австрия',         city: 'Инсбрук',  programName: 'Бизнес и управление',                                          tuition: null,  currency: null,  priority: 3 },
  { schoolId: 2639, programId: 359231, schoolName: 'Lancaster University - Leipzig',             country: 'Германия',        city: 'Лейпциг',  programName: '3 Semester Business Foundation + BSc Accounting and Finance', tuition: 14000, currency: 'EUR', priority: null },
  { schoolId: 4239, programId: 427966, schoolName: 'Universität für Weiterbildung Krems',        country: 'Австрия',         city: 'Кремс',    programName: 'Бизнес и управление',                                          tuition: null,  currency: null,  priority: null },
  { schoolId: 1527, programId: 280866, schoolName: 'Bournemouth University - Talbot Campus',     country: 'Великобритания',  city: 'Борнмут',  programName: 'BA (Hons) Business and Management',                            tuition: null,  currency: null,  priority: null },
  { schoolId: 3837, programId: 426886, schoolName: 'SP Jain School of Global Management',        country: 'ОАЭ',             city: 'Дубай',    programName: 'IT и технологии',                                              tuition: null,  currency: null,  priority: null },
]

// Реальные IDP scholarship_ids
const SCHOLARSHIPS = [
  { kind: 'idp', scholarshipId: 3085, title: 'Edinburgh Global Undergraduate Mathematics Scholarships', institution: 'University of Edinburgh', amountText: '£5,000 / год', deadline: '2026-03-31' },
  { kind: 'idp', scholarshipId: 3428, title: 'Rosedale OSSD University of Edinburgh Scholarship',       institution: 'University of Edinburgh', amountText: '£10,000 / год', deadline: '2026-04-30' },
  { kind: 'idp', scholarshipId: 3619, title: "Haworth Charitable Trust Manchester's Artist Community Studio Space Scholarship", institution: 'University of Manchester', amountText: '£8,000 / год', deadline: null },
]

const MOTIVATION_LETTER = {
  authorName: 'Алексей Демо',
  whyApplying: 'Я подаюсь на программу «Бизнес и управление» в Universität Wien, потому что хочу строить международную карьеру в управлении технологическими компаниями. Старейший университет немецкоязычного мира, сильная школа экономики и контакт с европейским tech-рынком — то, что мне нужно.',
  whyInterest: 'Мой интерес к бизнесу начался с собственного pet-проекта в 10 классе — я организовал онлайн-репетиторство по математике для младших школьников и довёл оборот до 80 000 ₽/мес. Это показало мне, насколько интересно превращать идею в работающий продукт.',
  whySuitable: 'IELTS 7.0, GPA 4.7, призёр All-Russian Math Olympiad 2025, опыт лидерства в школьной команде по робототехнике. Имею собственный успешный микро-бизнес. Готов к нагрузке европейского университета.',
  studiesRelated: 'В 10-11 классах углублённо изучал алгебру, мат-анализ, экономику. Прошёл онлайн-курс «Foundations of Business Strategy» от Coursera. Школьный проект — анализ unit-экономики моего репетиторского проекта. Всё это напрямую готовит к выбранной программе.',
  skills: 'Аналитическое мышление, базовое знание Excel и SQL, опыт презентаций, английский C1, немецкий A2 (учу). Умею читать финансовые отчёты, провожу cohort-анализ когорт своих учеников.',
  otherAchievements: 'Капитан школьной команды по робототехнике (3 место в RoboCup Junior 2025). Запустил math-club для младших классов. Прошёл за 4 месяца от 0 до 80k ₽/мес операционной прибыли в своём репетиторском проекте.',
  workExperience: 'Основатель и оператор онлайн-репетиторской платформы (2024–2025) — 12 учеников, 80k ₽/мес. Стажировался 2 месяца в локальной IT-компании летом 2025 — писал автотесты на Python. Участвовал в школьном бизнес-кейс-чемпионате (2 место).',
  futurePlans: 'После бакалавриата планирую магистратуру по management (WU Vienna / IE Business School / HEC Paris) и работу в стратегическом консалтинге или product-management в tech. В долгосрочной перспективе — собственная edtech-компания на европейском рынке.',
}

const ACTIVITIES = [
  { days: 30, type: 'stage_change',         content: 'Куратор Анна назначена сопровождающим' },
  { days: 28, type: 'note',                 content: 'Стратегическая сессия проведена. Зафиксирован профиль и цели.' },
  { days: 25, type: 'project_field_filled', content: 'Куратор заполнил поле «Цели и мотивация» в проекте студента' },
  { days: 24, type: 'project_confirmed',    content: 'Профиль студента утверждён — переходим к подбору программ' },
  { days: 20, type: 'shortlist_added',      content: 'Куратор добавил вуз: Universität Wien — Бизнес и управление' },
  { days: 19, type: 'shortlist_added',      content: 'Куратор добавил вуз: Lancaster University Leipzig — BSc Business Analytics' },
  { days: 18, type: 'shortlist_added',      content: 'Куратор добавил вуз: Universität Innsbruck (UIBK) — Бизнес и управление' },
  { days: 17, type: 'shortlist_published',  content: 'Подборка из 7 программ отправлена клиенту' },
  { days: 14, type: 'roadmap_sent',         content: 'Куратор отправил дорожную карту на согласование' },
  { days: 13, type: 'roadmap_approved',     content: 'Клиент утвердил дорожную карту' },
  { days: 10, type: 'scholarship_added',    content: 'Раскрыта стипендия Edinburgh Global Undergraduate Mathematics Scholarships (£5,000/год)' },
  { days: 8,  type: 'essay_approved',       content: 'Резюме (CV) утверждено куратором' },
  { days: 7,  type: 'essay_approved',       content: 'Мотивационное письмо утверждено куратором' },
  { days: 5,  type: 'note',                 content: 'Запрошены транскрипты школы — нужны сканы за 10-11 классы' },
  { days: 2,  type: 'application_created',  content: 'Создана заявка в Universität Wien' },
]

/** Полный сброс/пересоздание демо-клиента. Идемпотентно. */
export async function resetDemoClient(sb: SupabaseClient): Promise<{ clientId: number; recreated: boolean }> {
  // 1. Найдём существующего демо
  const { data: existing } = await sb.from('clients').select('id').eq('email', DEMO_EMAIL).maybeSingle()
  if (existing?.id) {
    const tables = [
      'client_applications', 'client_activities', 'client_essays', 'client_documents',
      'client_universities', 'client_scholarships', 'client_stages',
      'client_invitations', 'client_checklist_progress',
    ]
    for (const t of tables) await sb.from(t).delete().eq('client_id', existing.id)
    await sb.from('clients').delete().eq('id', existing.id)
  }

  // 2. auth.users — создаём или сохраняем существующего
  const { data: authList } = await sb.auth.admin.listUsers({ perPage: 1000 })
  let authId = authList?.users.find(u => u.email === DEMO_EMAIL)?.id
  if (authId) {
    await sb.auth.admin.updateUserById(authId, { password: DEMO_PASSWORD })
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email: DEMO_EMAIL, password: DEMO_PASSWORD, email_confirm: true,
    })
    if (error || !data.user) throw new Error(`auth.users: ${error?.message}`)
    authId = data.user.id
  }

  // 3. public.users
  const { data: pubExisting } = await sb.from('users').select('id').eq('id', authId).maybeSingle()
  if (pubExisting) {
    await sb.from('users').update({ role: 'client', name: DEMO_NAME, email: DEMO_EMAIL }).eq('id', authId)
  } else {
    await sb.from('users').insert({ id: authId, email: DEMO_EMAIL, role: 'client', name: DEMO_NAME })
  }

  // 4. clients (curator_id=null — изоляция от кураторов)
  // Демо привязан к ТЕСТ-продажнику. Так демо-данные не пачкают аналитику
  // живых продажников и им не приходят уведомления о бронированиях демо.
  const { data: salesp } = await sb.from('users').select('id')
    .eq('email', 'test@goandstudy.com')
    .limit(1).maybeSingle()
  const { data: client, error: cErr } = await sb.from('clients').insert({
    name: DEMO_NAME,
    email: DEMO_EMAIL,
    country: 'Австрия',
    status: 'active',
    curator_id: null,
    salesperson_id: salesp?.id,
    first_payment_date: new Date(Date.now() - 30 * 24 * 3600e3).toISOString().slice(0, 10),
    current_stage_code: 'applications',
    project_data: DEMO_PROJECT_DATA,
    roadmap_data: DEMO_ROADMAP_DATA,
    roadmap_approved_at: new Date(Date.now() - 13 * 24 * 3600e3).toISOString(),
    roadmap_approved_by_name: 'Алексей Демо',
    onboarded: false,
  }).select('id').single()
  if (cErr) throw new Error(`clients: ${cErr.message}`)
  const clientId = client!.id

  // 5. shortlist
  for (const u of SHORTLIST) {
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
      notes: JSON.stringify({ school_id: u.schoolId, program_id: u.programId }),
    })
  }

  // 6. scholarships
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

  // 7. essays
  await sb.from('client_essays').insert([
    {
      client_id: clientId, type: 'resume',
      content: null, curator_content: null, status: 'draft',
      last_updated_at: new Date(Date.now() - 8 * 24 * 3600e3).toISOString(),
    },
    {
      client_id: clientId, type: 'motivation',
      content: MOTIVATION_LETTER, curator_content: MOTIVATION_LETTER, status: 'approved',
      submitted_at: new Date(Date.now() - 8 * 24 * 3600e3).toISOString(),
      approved_at: new Date(Date.now() - 7 * 24 * 3600e3).toISOString(),
      last_updated_at: new Date(Date.now() - 7 * 24 * 3600e3).toISOString(),
    },
  ])

  // 8. activities
  for (const e of ACTIVITIES) {
    await sb.from('client_activities').insert({
      client_id: clientId,
      activity_type: e.type,
      content: e.content,
      created_at: new Date(Date.now() - e.days * 24 * 3600e3).toISOString(),
    })
  }

  return { clientId, recreated: !!existing }
}
