/**
 * ХАРДКОД-ДАННЫЕ для /demo. НИКАКОЙ связи с БД. Лиды могут править что
 * угодно — изменения живут только в их браузере и сбрасываются при рефреше.
 *
 * Все типы — из mock-data.ts (тех же что использует /client). Компоненты
 * клиент-кабинета переиспользуются как есть.
 */
import type { TimelineStage, University, RequiredDoc, Essay } from '@/app/client/mock-data'
import type { StudentProjectData } from '@/lib/student-project-types'
import type { RoadmapData } from '@/lib/roadmap-types'
import type { ApplicationRow } from '@/lib/client-data'

export const DEMO_CLIENT_NAME = 'Алексей Демо'

/* ─── Timeline (12 этапов, текущий — Подача 7/12) ─── */
export const DEMO_TIMELINE: TimelineStage[] = [
  { key: 'profo',        num: 1,  title: 'Профориентация',   state: 'done' },
  { key: 'strategy',     num: 2,  title: 'Стратсессия',      state: 'done' },
  { key: 'roadmap',      num: 3,  title: 'Дорожная карта',   state: 'done' },
  { key: 'uni_search',   num: 4,  title: 'Подбор вузов',     state: 'done' },
  { key: 'presentation', num: 5,  title: 'Презентация',      state: 'done' },
  { key: 'documents',    num: 6,  title: 'Документы',        state: 'done' },
  { key: 'applications', num: 7,  title: 'Подача',           state: 'current', progress: 40 },
  { key: 'offer',        num: 8,  title: 'Оффер',            state: 'upcoming' },
  { key: 'enrollment',   num: 9,  title: 'Зачисление',       state: 'upcoming' },
  { key: 'housing',      num: 10, title: 'Жильё',            state: 'upcoming' },
  { key: 'visa',         num: 11, title: 'Виза',             state: 'upcoming' },
  { key: 'trip_prep',    num: 12, title: 'Поездка',          state: 'upcoming' },
]

/* ─── Подборка вузов (7 шт., все с реальными school/program_id из parser DB
   у которых УЖЕ заполнены ИИ данные — клик по карточке открывает живую
   страницу в read-only режиме без записей) ─── */
export const DEMO_UNIVERSITIES: University[] = [
  {
    key: 'demo-u1',
    name: 'Universität Wien',
    city: 'Вена',
    country: 'Австрия',
    flag: '🇦🇹',
    schoolId: 4218,
    programId: 427914,
    program: 'Бизнес и управление',
    tuition: '€726.72 EUR / семестр',
    rank: { source: 'QS', value: 152 },
    reason: '',
    tags: ['🗓 Октябрь 2026', 'IELTS ≥ 6.5'],
  },
  {
    key: 'demo-u2',
    name: 'Lancaster University - Leipzig',
    city: 'Лейпциг',
    country: 'Германия',
    flag: '🇩🇪',
    schoolId: 2639,
    programId: 359238,
    program: '2 Semester Business Foundation + BSc Business Analytics',
    tuition: '€14,000 / год',
    rank: { source: 'QS', value: 157 },
    reason: '',
    tags: ['🗓 Октябрь 2026', 'IELTS ≥ 5.5', 'Co-op'],
  },
  {
    key: 'demo-u3',
    name: 'Universität Innsbruck (UIBK)',
    city: 'Инсбрук',
    country: 'Австрия',
    flag: '🇦🇹',
    schoolId: 4235,
    programId: 427952,
    program: 'Бизнес и управление',
    tuition: '€726.72 EUR / семестр',
    rank: { source: 'QS', value: 351 },
    reason: '',
    tags: ['🗓 Зима 2026/27', 'IELTS ≥ 5.5'],
  },
  {
    key: 'demo-u4',
    name: 'Lancaster University - Leipzig',
    city: 'Лейпциг',
    country: 'Германия',
    flag: '🇩🇪',
    schoolId: 2639,
    programId: 359231,
    program: '3 Semester Business Foundation + BSc Accounting and Finance',
    tuition: '€14,000 / год',
    rank: { source: 'QS', value: 157 },
    reason: '',
    tags: ['🗓 Январь 2027', 'IELTS ≥ 5.5'],
  },
  {
    key: 'demo-u5',
    name: 'Universität für Weiterbildung Krems',
    city: 'Кремс',
    country: 'Австрия',
    flag: '🇦🇹',
    schoolId: 4239,
    programId: 427966,
    program: 'Бизнес и управление',
    tuition: null as any,
    rank: { source: 'Webometrics', value: 3548 },
    reason: '',
    tags: ['🗓 Сентябрь 2026'],
  },
  {
    key: 'demo-u6',
    name: 'Bournemouth University - Talbot Campus',
    city: 'Борнмут',
    country: 'Великобритания',
    flag: '🇬🇧',
    schoolId: 1527,
    programId: 280866,
    program: 'BA (Hons) Business and Management',
    tuition: '£17,500 / год',
    rank: null,
    reason: '',
    tags: ['🗓 Сентябрь 2026', 'IELTS ≥ 6.0'],
  },
  {
    key: 'demo-u7',
    name: 'SP Jain School of Global Management',
    city: 'Дубай',
    country: 'ОАЭ',
    flag: '🇦🇪',
    schoolId: 3837,
    programId: 426886,
    program: 'IT и технологии',
    tuition: '$28,000 / год',
    rank: null,
    reason: '',
    tags: ['🗓 Октябрь 2026', 'Conditional'],
  },
]

/* ─── Стипендии (3 шт., чисто информативные — без линков) ─── */
export const DEMO_SCHOLARSHIPS = [
  {
    id: 'demo-s1',
    kind: 'idp' as const,
    title: 'Edinburgh Global Undergraduate Mathematics Scholarships',
    institution: 'University of Edinburgh',
    amount: '£5,000 / год',
    deadline: '2026-03-31',
    status: 'preparing',
  },
  {
    id: 'demo-s2',
    kind: 'idp' as const,
    title: 'Rosedale OSSD University of Edinburgh Scholarship',
    institution: 'University of Edinburgh',
    amount: '£10,000 / год',
    deadline: '2026-04-30',
    status: 'preparing',
  },
  {
    id: 'demo-s3',
    kind: 'idp' as const,
    title: "Haworth Charitable Trust Manchester's Artist Community Studio Space Scholarship",
    institution: 'University of Manchester',
    amount: '£8,000 / год',
    deadline: null,
    status: 'preparing',
  },
]

/* ─── Project Student (стратегическая сессия) ─── */
export const DEMO_PROJECT: StudentProjectData = {
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
} as any

/* ─── Roadmap (утверждена) ─── */
export const DEMO_ROADMAP: { data: RoadmapData; approvedAt: string | null; approvedBy: string | null } = {
  data: {
    stages: [
      {
        stageKey: 'stage1', stageName: 'Знакомство и оценка',
        items: [
          { key: 'i1', title: 'Стратегическая сессия', date: '08.04', done: true },
          { key: 'i2', title: 'Анализ профиля и оценка шансов', date: '10.04', done: true },
        ],
      },
      {
        stageKey: 'stage2', stageName: 'Подбор программ',
        items: [
          { key: 'i3', title: 'Подобрать 7-10 программ', date: '15.04', done: true },
          { key: 'i4', title: 'Утвердить финальный список', date: '20.04', done: true },
        ],
      },
      {
        stageKey: 'stage3', stageName: 'Документы',
        items: [
          { key: 'i5', title: 'Резюме (CV)', date: '02.05', done: true },
          { key: 'i6', title: 'Мотивационное письмо', date: '03.05', done: true },
          { key: 'i7', title: 'Транскрипты школы', date: '—', done: false, current: true },
        ],
      },
    ],
    sent_at: '2026-04-26T10:00:00.000Z',
    sent_by_name: 'Анна Куратор',
  } as any,
  approvedAt: '2026-04-27T12:00:00.000Z',
  approvedBy: 'Алексей Демо',
}

/* ─── Эссе (2 — резюме draft, мотивашка approved) ─── */
export const DEMO_ESSAYS: Essay[] = [
  { key: 'resume',     title: 'Резюме',                  subtitle: 'CV в формате resume.io',           emoji: '📄', state: 'in_progress', updatedAt: '2026-05-02' },
  { key: 'motivation', title: 'Мотивационное письмо',    subtitle: 'Personal Statement по UCAS',       emoji: '✍️', state: 'ready',       updatedAt: '2026-05-03' },
]

export const DEMO_MOTIVATION_LETTER = {
  authorName: DEMO_CLIENT_NAME,
  whyApplying: 'Я подаюсь на программу «Бизнес и управление» в Universität Wien, потому что хочу строить международную карьеру в управлении технологическими компаниями. Старейший университет немецкоязычного мира, сильная школа экономики и контакт с европейским tech-рынком — то, что мне нужно.',
  whyInterest: 'Мой интерес к бизнесу начался с собственного pet-проекта в 10 классе — я организовал онлайн-репетиторство по математике для младших школьников и довёл оборот до 80 000 ₽/мес. Это показало мне, насколько интересно превращать идею в работающий продукт.',
  whySuitable: 'IELTS 7.0, GPA 4.7, призёр All-Russian Math Olympiad 2025, опыт лидерства в школьной команде по робототехнике. Имею собственный успешный микро-бизнес. Готов к нагрузке европейского университета.',
  studiesRelated: 'В 10-11 классах углублённо изучал алгебру, мат-анализ, экономику. Прошёл онлайн-курс «Foundations of Business Strategy» от Coursera. Школьный проект — анализ unit-экономики моего репетиторского проекта. Всё это напрямую готовит к выбранной программе.',
  skills: 'Аналитическое мышление, базовое знание Excel и SQL, опыт презентаций, английский C1, немецкий A2 (учу). Умею читать финансовые отчёты, провожу cohort-анализ когорт своих учеников.',
  otherAchievements: 'Капитан школьной команды по робототехнике (3 место в RoboCup Junior 2025). Запустил math-club для младших классов. Прошёл за 4 месяца от 0 до 80k ₽/мес операционной прибыли в своём репетиторском проекте.',
  workExperience: 'Основатель и оператор онлайн-репетиторской платформы (2024–2025) — 12 учеников, 80k ₽/мес. Стажировался 2 месяца в локальной IT-компании летом 2025 — писал автотесты на Python. Участвовал в школьном бизнес-кейс-чемпионате (2 место).',
  futurePlans: 'После бакалавриата планирую магистратуру по management (WU Vienna / IE Business School / HEC Paris) и работу в стратегическом консалтинге или product-management в tech. В долгосрочной перспективе — собственная edtech-компания на европейском рынке.',
}

/* ─── Документы ─── */
export const DEMO_REQUIRED_DOCS: RequiredDoc[] = [
  { key: 'resume',         title: 'Резюме (CV)',                  status: 'pending',  hint: 'Отправлено куратору, ждёт финал', href: '/demo/motivation' },
  { key: 'motivation',     title: 'Мотивационное письмо',         status: 'uploaded', hint: 'Готово, куратор утвердил.', fileName: 'Мотивационное письмо — финал', href: '/demo/motivation' },
  { key: 'transcript',     title: 'Транскрипты школы',            status: 'missing',  hint: 'Нужны сканы за 10-11 классы' },
  { key: 'passport',       title: 'Скан паспорта',                status: 'uploaded', fileName: 'passport.pdf', fileSize: '1.2 МБ' },
  { key: 'ielts',          title: 'Сертификат IELTS',             status: 'uploaded', fileName: 'IELTS_Akademik_Demo.pdf', fileSize: '420 КБ' },
  { key: 'recommendation', title: 'Рекомендательное письмо',      status: 'missing',  hint: 'От школьного учителя по математике' },
]

/* ─── Активности ─── */
export const DEMO_ACTIVITIES = [
  { days: 30, type: 'stage_change',         content: 'Куратор Анна назначена сопровождающим' },
  { days: 28, type: 'note',                 content: 'Стратегическая сессия проведена. Зафиксирован профиль и цели.' },
  { days: 25, type: 'project_field_filled', content: 'Куратор заполнил поле «Цели и мотивация» в проекте студента' },
  { days: 24, type: 'project_confirmed',    content: 'Профиль студента утверждён — переходим к подбору программ' },
  { days: 20, type: 'shortlist_added',      content: 'Куратор добавил вуз: Universität Wien — Бизнес и управление' },
  { days: 19, type: 'shortlist_added',      content: 'Куратор добавил вуз: Lancaster Leipzig — BSc Business Analytics' },
  { days: 18, type: 'shortlist_added',      content: 'Куратор добавил вуз: UIBK — Бизнес и управление' },
  { days: 17, type: 'shortlist_published',  content: 'Подборка из 7 программ отправлена клиенту' },
  { days: 14, type: 'roadmap_sent',         content: 'Куратор отправил дорожную карту на согласование' },
  { days: 13, type: 'roadmap_approved',     content: 'Клиент утвердил дорожную карту' },
  { days: 10, type: 'scholarship_added',    content: 'Раскрыта стипендия Edinburgh Global Undergraduate Math (£5k/год)' },
  { days: 8,  type: 'essay_approved',       content: 'Резюме (CV) утверждено куратором' },
  { days: 7,  type: 'essay_approved',       content: 'Мотивационное письмо утверждено куратором' },
  { days: 5,  type: 'note',                 content: 'Запрошены транскрипты школы — нужны сканы за 10-11 классы' },
  { days: 2,  type: 'application_created',  content: 'Создана заявка в Universität Wien' },
]

/* ─── Заявки ─── */
export const DEMO_APPLICATIONS: ApplicationRow[] = [
  {
    id: 'demo-app-1',
    client_id: 0,
    shortlist_id: null,
    profile_id: null,
    university_name: 'Universität Wien',
    program_name: 'Бизнес и управление',
    country: 'Австрия',
    intake: '2026-10-01',
    school_id: 4218,
    stage: 'docs_collected',
    decision: null,
    app_deadline: '2026-09-05',
    submitted_at: null,
    decision_at: null,
    fee_amount: 23,
    fee_currency: 'EUR',
    fee_paid_at: null,
    school_app_ref: null,
    hold_reason: null,
    notes: null,
    created_at: '2026-05-08T10:00:00.000Z',
    updated_at: '2026-05-08T10:00:00.000Z',
  },
] as any
