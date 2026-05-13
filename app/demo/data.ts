/**
 * ХАРДКОД-ДАННЫЕ для /demo. НИКАКОЙ связи с БД.
 * Все правки клиента живут в sessionStorage и сбрасываются при закрытии вкладки.
 */
import type { TimelineStage, University, RequiredDoc, Essay } from '@/app/client/mock-data'
import type { StudentProjectData } from '@/lib/student-project-types'
import type { RoadmapData } from '@/lib/roadmap-types'
import type { ApplicationRow } from '@/lib/client-data'

export const DEMO_CLIENT_NAME = 'Alexey Demo'

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
  whyApplying: "I am applying for the Bachelor's programme in Business Administration at the University of Vienna because this is the logical next step for me — and because I want a serious European education without the financial trap that comes with studying in the UK or the US. The Austrian academic tradition in economics and management is one of the strongest in the world, and the fact that the University of Vienna treats education as a public good rather than a luxury product matters to me. I do not want to start my professional life with significant debt. I want to start it with knowledge, a European network and the freedom to choose my next step on my own terms.",
  whyInterest: "Two years ago I started tutoring younger students in mathematics. What began as a side project gradually turned into something I had not planned: a small online tutoring business. Running it taught me that even a tiny business is mostly about decisions made with incomplete information — and that this is exactly the kind of work I want to do for the rest of my life. Business is where rigorous analysis and human judgement meet, and that combination is what genuinely fascinates me about the field.",
  whySuitable: "I bring a strong analytical foundation: GPA 4.7/5.0 at a mathematics-focused school, prize-winner of the All-Russian Mathematics Olympiad 2025, IELTS 7.0 and active German learner (currently A2, targeting B2). I have already proven I can launch and operate a real business — 12 students, around 80,000 RUB/month revenue. I take initiative, I follow through on long-term projects (captain of the robotics team for two years) and I can hold technical conversations after a summer as a Python QA intern.",
  studiesRelated: "My current studies are directly relevant. Advanced mathematics, calculus and economics in the school programme, GPA 4.7/5.0. To deepen my business understanding I completed Foundations of Business Strategy by the University of Virginia on Coursera with an A grade across four modules. My school project analysed the unit economics of my own tutoring business — turning numbers from a real operation into a structured case study. All of this directly prepares me for an undergraduate business programme.",
  skills: "Analytical thinking, working knowledge of Excel and SQL, basic Python (enough to write pytest suites), English C1 and German A2 (in progress). I can read financial statements, run cohort analysis on my tutoring students every month and present results clearly — both in writing and in front of an audience. As a robotics captain I have spent two years coordinating a team of six and managing project deadlines.",
  otherAchievements: "Captain of the school robotics team — 3rd place at RoboCup Junior 2025 (Soccer Lightweight category). Prize-winner of the All-Russian Mathematics Olympiad 2025. Founded a math club for younger students, where I run weekly olympiad-prep sessions. Reached the finals of two school-organised business case championships.",
  workExperience: "Founder and operator of an online maths tutoring platform (2024 — present): 12 students, around 80,000 RUB/month revenue. I personally handle marketing (Instagram and VKontakte), teacher recruitment and customer service. Summer 2025: Python QA intern at a local IT company — wrote pytest suites for a backend microservice, raised test coverage from 35% to 71% and received a written recommendation from the tech lead. 2nd place in the school business-case championship (2024).",
  futurePlans: "After the bachelor's I plan to pursue a Master's in management (WU Vienna, IE Business School or HEC Paris are my current target schools) and work in strategic consulting or tech product management. In the long run I want to return to entrepreneurship — but with the foundation, the European network and the macro perspective that only a proper university education in Europe can provide. An edtech company on the European market is the long-term goal.",
}

/* ─── Документы — используем тот же список что в /client с образцами в /public/samples/ ─── */
export const DEMO_REQUIRED_DOCS: RequiredDoc[] = [
  { key: 'passport',       title: 'Паспорт',                   hint: 'Заграничный, скан первой страницы',           status: 'missing', hasExample: true, exampleTitle: 'Паспорт — образец',          samplePath: '/samples/passport.jpg' },
  { key: 'diploma',        title: 'Диплом',                    hint: 'Диплом о высшем/среднем образовании',         status: 'missing', hasExample: true, exampleTitle: 'Диплом — образец',           samplePath: '/samples/diploma.jpg' },
  { key: 'transcript',     title: 'Транскрипт',                hint: 'Выписка оценок (с переводом если требуется)', status: 'missing', hasExample: true, exampleTitle: 'Транскрипт — образец',       samplePath: '/samples/transcript.jpg' },
  { key: 'attestat',       title: 'Аттестат',                  hint: 'Школьный аттестат с приложением оценок',      status: 'missing', hasExample: true, exampleTitle: 'Аттестат — образец',         samplePath: '/samples/attestat.jpeg' },
  { key: 'ielts',          title: 'IELTS / TOEFL',             hint: 'Сертификат языкового теста',                  status: 'missing', hasExample: true, exampleTitle: 'IELTS — образец',            samplePath: '/samples/ielts.jpg' },
  { key: 'recommendation', title: 'Рекомендательное письмо',   hint: 'От школы / преподавателя / работодателя',     status: 'missing', hasExample: true, exampleTitle: 'Рекомендательное письмо — образец', samplePath: '/samples/recomm.pdf' },
  {
    key: 'resume',
    title: 'Резюме',
    hint: 'Академический и внеклассный опыт, портфолио',
    status: 'locked',
    lockedHint: 'Создаётся через блок «Резюме» выше. Загорится когда вы заполните, а куратор подготовит финальную версию.',
  },
  {
    key: 'motivation',
    title: 'Мотивационное письмо',
    hint: 'Почему именно эти вузы и эта программа',
    status: 'locked',
    lockedHint: 'Создаётся через блок «Мотивационное письмо» выше. Загорится когда вы заполните, а куратор подготовит финальную версию.',
  },
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

/* ─── Богатая информация по вузам для /demo/universities/[key] ─── */
export type DemoUniDetail = {
  description: string
  founded: number
  type: string
  studentsTotal: string
  rankNote: string
  language: string
  intakes: { term: string; deadline: string }[]
  requirements: string[]
  programs: { name: string; tuition: string; duration: string; fee: string }[]
  accommodation: string
  scholarshipsHint: string
  whyHere: string
}

export const DEMO_UNI_DETAILS: Record<string, DemoUniDetail> = {
  'demo-u1': {
    description: 'Старейший университет немецкоязычного мира (основан в 1365), один из самых престижных в Европе. Сильная школа бизнеса и экономики, обширная сеть международных партнёрств. Кампус в центре Вены — рядом с Бельведером, Хофбургом и Венским университетом театра и музыки.',
    founded: 1365,
    type: 'Государственный, исследовательский',
    studentsTotal: '~88 000',
    rankNote: 'QS World Rank #152 (2025). Топ-1 в Австрии. Сильные позиции в Theology, Philosophy, Modern Languages.',
    language: 'Немецкий B2 / некоторые программы English',
    intakes: [
      { term: 'Зимний семестр (октябрь 2026)', deadline: '5 сентября 2026' },
      { term: 'Летний семестр (март 2027)', deadline: '5 февраля 2027' },
    ],
    requirements: [
      'Аттестат с переводом + апостиль',
      'Знание немецкого B2 (ÖSD / Goethe) или IELTS 6.5 для English-track',
      'Мотивационное письмо (2 стр.)',
      'CV',
      'Транскрипты последних 2 лет',
    ],
    programs: [
      { name: 'Bachelor Business and Economics', tuition: '€726.72 / семестр', duration: '6 семестров', fee: '€0' },
      { name: 'Bachelor International Business Administration', tuition: '€726.72 / семестр', duration: '6 семестров', fee: '€0' },
    ],
    accommodation: 'Студенческие общежития ÖAD (€280-450/мес) + частный сектор (€500-800/мес). Бронируй за 4-6 месяцев — Вена популярна.',
    scholarshipsHint: 'OeAD стипендии до €1100/мес для отличников, Erasmus+ обмены, факультетские гранты для научных проектов.',
    whyHere: 'Бюджетная программа в столице с мировым рейтингом + возможность подработки 20 часов в неделю для не-EU студентов. После 5 лет учёбы и работы в Австрии — возможность ВНЖ.',
  },
  'demo-u2': {
    description: 'Британский Lancaster University открыл кампус в Лейпциге в 2018 году — это полноценный филиал с дипломом UK. Учёба на английском, преподаватели из UK, всё под британский стандарт качества. Лейпциг — динамичный молодой город с очень низкой стоимостью жизни относительно других столиц.',
    founded: 1964,
    type: 'Частный кампус британского ВУЗа',
    studentsTotal: '~600 (Лейпциг) / ~16 000 (Lancaster UK)',
    rankNote: 'QS World Rank #157. Lancaster в топ-10 UK по Business, Marketing, Linguistics.',
    language: 'Английский',
    intakes: [
      { term: 'Октябрь 2026', deadline: '1 августа 2026' },
      { term: 'Январь 2027', deadline: '15 ноября 2026' },
    ],
    requirements: [
      'IELTS 5.5+ (Foundation) / 6.0+ (прямой Year 1)',
      'Аттестат, транскрипты',
      'Personal Statement',
      '1 рекомендательное письмо',
    ],
    programs: [
      { name: '2 Semester Business Foundation + BSc Business Analytics', tuition: '€14 000 / год', duration: '4 года', fee: '€0' },
      { name: '3 Semester Business Foundation + BSc Accounting and Finance', tuition: '€14 000 / год', duration: '4-4.5 года', fee: '€0' },
    ],
    accommodation: 'Lancaster Hostel Leipzig — собственное общежитие кампуса €350-550/мес. Альтернатива — съём в Лейпциге €300-450/мес.',
    scholarshipsHint: 'Lancaster Excellence Award €2000-4000, ранние bird discounts, family discount для второго ребёнка.',
    whyHere: 'Британский диплом по цене Австрии. Foundation year даёт время довести английский до C1, профильную подготовку и адаптироваться к UK-стилю обучения.',
  },
  'demo-u3': {
    description: 'Universität Innsbruck — крупнейший университет в западной Австрии, в горном городе у самых Альп. Сильная школа экономики и менеджмента, активное международное сообщество. Идеален если хочется тихий студенческий город с европейской инфраструктурой и снежной зимой.',
    founded: 1669,
    type: 'Государственный',
    studentsTotal: '~28 000',
    rankNote: 'QS World Rank #351. Топ-3 в Австрии в Earth Sciences, Sports Sciences.',
    language: 'Немецкий B2 (обязательно)',
    intakes: [
      { term: 'Зимний семестр (октябрь 2026)', deadline: '5 сентября 2026' },
      { term: 'Летний семестр (март 2027)', deadline: '5 февраля 2027' },
    ],
    requirements: [
      'Немецкий B2 (ÖSD / Goethe / TestDaF)',
      'Аттестат + апостиль',
      'Заявление + мотивашка',
    ],
    programs: [
      { name: 'Bachelor Wirtschaftswissenschaften (Management)', tuition: '€726.72 / семестр', duration: '6 семестров', fee: '€0' },
      { name: 'Bachelor International Economic and Business Studies', tuition: '€726.72 / семестр', duration: '6 семестров', fee: '€0' },
    ],
    accommodation: 'Студенческие общежития ÖAD €240-380/мес. Город небольшой — пешком до универа 15 минут.',
    scholarshipsHint: 'Universitätsförderung Tirol, Innsbruck Scholarship for International Excellence.',
    whyHere: 'Самая дешёвая жизнь среди вузов в подборке + горы, snowboard и активное outdoor-комьюнити. После 5 лет работы в регионе — путь к ВНЖ Австрии.',
  },
  'demo-u4': {
    description: 'То же кампус Lancaster в Лейпциге, но программа Accounting and Finance — с 3 семестрами Foundation для более глубокой математической и финансовой подготовки. Подходит если хочешь сразу углубиться в финансы.',
    founded: 1964,
    type: 'Частный кампус британского ВУЗа',
    studentsTotal: '~600 (Лейпциг) / ~16 000 (Lancaster UK)',
    rankNote: 'QS World Rank #157. Lancaster Accounting and Finance — Top-3 в UK.',
    language: 'Английский',
    intakes: [
      { term: 'Январь 2027', deadline: '15 ноября 2026' },
    ],
    requirements: [
      'IELTS 5.5+ (Foundation)',
      'Аттестат, транскрипты',
      'Personal Statement',
      'Базовая математика — extra plus',
    ],
    programs: [
      { name: '3 Semester Business Foundation + BSc Accounting and Finance', tuition: '€14 000 / год', duration: '4.5 года', fee: '€0' },
    ],
    accommodation: 'Lancaster Hostel Leipzig €350-550/мес. Лейпциг — один из самых доступных немецких городов.',
    scholarshipsHint: 'Lancaster Excellence Award, early bird до 15 ноября.',
    whyHere: 'Сильное финансовое ядро + британский диплом. Бакалавриат с CFA-ready подготовкой и стажировкой в финсекторе UK/EU.',
  },
  'demo-u5': {
    description: 'Donau-Universität Krems — частный исследовательский университет послевузовского образования (Postgraduate). Основан в 1994, специализируется на executive-программах и professional development. Кампус — на берегу Дуная, в винодельческом регионе Вахау.',
    founded: 1994,
    type: 'Государственный, postgraduate-фокус',
    studentsTotal: '~9 000',
    rankNote: 'Webometrics #3548. Молодой университет, без global QS-ранжирования. Сильные позиции в Healthcare Management и Public Administration.',
    language: 'Немецкий B2 / English (по программе)',
    intakes: [
      { term: 'Сентябрь 2026', deadline: '15 июля 2026' },
    ],
    requirements: [
      'Бакалавр (постбакалаврская программа)',
      'IELTS 6.0 / DSH 2',
      'Мотивашка + CV',
      'Интервью (Zoom)',
    ],
    programs: [
      { name: 'Master Business and Management', tuition: '€7 500 / семестр', duration: '4 семестра', fee: '€100' },
    ],
    accommodation: 'Krems Studentenheim €300-400/мес. Кремс — маленький город, всё пешком.',
    scholarshipsHint: 'BMBWF stipendien до €1100/мес, BAföG для немецких студентов.',
    whyHere: 'Сфокусированные executive-программы, маленькие группы, доступ к преподавателям. Подходит для целеустремлённых студентов которые хотят быстро вернуться в карьеру.',
  },
  'demo-u6': {
    description: 'Bournemouth University — современный британский университет на южном побережье Англии. Известен сильной школой Media, Tourism, Business. Кампус Talbot — главный, в 5 минутах от центра Борнмута. Сам город — курорт у моря с пляжами.',
    founded: 1992,
    type: 'Государственный (University status с 1992, корни с 1913)',
    studentsTotal: '~17 000',
    rankNote: 'Без QS World Rank. Top-50 в UK Modern University rankings. Лидер по Tourism, Animation, Media Production.',
    language: 'Английский',
    intakes: [
      { term: 'Сентябрь 2026', deadline: '15 января 2026 (UCAS Equal Consideration)' },
    ],
    requirements: [
      'IELTS 6.0 (минимум 5.5 в каждой секции)',
      'Аттестат UK A-Levels equivalent (3 предмета по выбору)',
      'UCAS Personal Statement',
      '1 рекомендация',
    ],
    programs: [
      { name: 'BA (Hons) Business and Management', tuition: '£17 500 / год', duration: '3 года (4 с placement)', fee: '£0' },
      { name: 'BA (Hons) International Business', tuition: '£17 500 / год', duration: '3 года', fee: '£0' },
    ],
    accommodation: 'Студенческие резиденции £150-200/нед. Аренда в Борнмуте £500-700/мес.',
    scholarshipsHint: 'International Excellence Scholarship £2 000-5 000, Country-specific awards.',
    whyHere: 'Англоязычный диплом UK, более доступная цена чем Лондон, прибрежный кампус с активным студенческим комьюнити. Placement year даёт оплачиваемую годовую стажировку.',
  },
  'demo-u7': {
    description: 'SP Jain School of Global Management — частная бизнес-школа с кампусами в Дубае, Сингапуре, Сиднее и Мумбае. Тристранничная программа: студенты учатся по году в каждой из стран, получая глобальный опыт. Сильный фокус на Asian/Middle East markets и tech-business.',
    founded: 2004,
    type: 'Частная, аккредитованная',
    studentsTotal: '~2 000',
    rankNote: 'Top-3 в ОАЭ. Forbes #3 Best International Business Programs (US-based ranking).',
    language: 'Английский',
    intakes: [
      { term: 'Октябрь 2026', deadline: '30 июня 2026' },
      { term: 'Февраль 2027', deadline: '30 октября 2026' },
    ],
    requirements: [
      'IELTS 6.5 / TOEFL 79',
      'SP-Jain Entrance Test (онлайн) ИЛИ SAT 1100+',
      'Mini-interview',
      'CV + Personal Statement',
    ],
    programs: [
      { name: 'BBA in Technology Management', tuition: '$28 000 / год', duration: '4 года', fee: '$100' },
      { name: 'BBA Marketing & Branding', tuition: '$28 000 / год', duration: '4 года', fee: '$100' },
    ],
    accommodation: 'On-campus residence $4 000-6 000/год. Дубай-кампус современный, всё включено.',
    scholarshipsHint: 'Merit Scholarship до 25% от tuition, Early-bird discount $2 000.',
    whyHere: 'Глобальный мультистрановой опыт за 4 года, английский язык, программа в Дубае — солнце, безопасность, low-tax, выход на стажировки в Эмиратах/Сингапуре. Conditional offer возможен без полного пакета.',
  },
}

/* ─── Начальное состояние резюме для демо ─── */
export const DEMO_INITIAL_RESUME = {
  personal: {
    jobTitle: 'High-school senior — preparing for a Bachelor in Business',
    firstName: 'Alexey',
    lastName: 'Demo',
    email: 'demo@goandstudy.com',
    phone: '+7 (900) 000-00-00',
    linkedIn: '',
    postcode: '125009',
    city: 'Moscow',
    country: 'Russia',
    dateOfBirth: '2008-03-15',
    profileSummary: 'Final-year high-school student with a strong analytical foundation (GPA 4.7/5.0) and real entrepreneurial track record. Founded and operates an online maths tutoring platform — 12 students, ~80,000 RUB/month revenue. Captain of the school robotics team, prize-winner of the All-Russian Mathematics Olympiad 2025. Preparing for a Bachelor in Business Administration at a top European university.',
  },
  links: [
    { id: 'l1', title: 'GitHub', url: 'https://github.com/demo' },
  ],
  workExperience: [
    {
      id: 'w1',
      jobTitle: 'Founder',
      company: 'Online Maths Tutoring (own project)',
      city: 'Moscow',
      startDate: '2024-09',
      endDate: 'present',
      description: 'Built from scratch an online maths tutoring platform for grades 7–9. Within 8 months: 12 students, ~80,000 RUB/month revenue. Personally handle marketing on Instagram and VKontakte, interview and select teachers, and run end-to-end customer service.',
    },
    {
      id: 'w2',
      jobTitle: 'Python QA Intern',
      company: 'Local IT company',
      city: 'Moscow',
      startDate: '2025-06',
      endDate: '2025-08',
      description: 'Wrote pytest suites for a backend microservice. Increased test coverage from 35% to 71%. Received a written recommendation from the tech lead.',
    },
  ],
  education: [
    {
      id: 'e1',
      school: 'School No. 1234, mathematics-focused track',
      degree: 'High School Diploma (grade 11)',
      startDate: '2018-09',
      endDate: '2026-06',
      city: 'Moscow',
      description: 'Advanced mathematics (5/5), Physics (5/5), English (C1). GPA 4.7/5.0. IELTS 7.0.',
    },
  ],
  courses: [
    { id: 'c1', title: 'Foundations of Business Strategy', city: 'Coursera — University of Virginia', year: '2025', description: 'Certificate, 4 modules, A grade.' },
  ],
  skills: [
    { id: 's1', name: 'Excel / Google Sheets', level: 'Intermediate' as const },
    { id: 's2', name: 'Python (basics)',         level: 'Beginner' as const },
    { id: 's3', name: 'Presentations (Keynote)', level: 'Advanced' as const },
    { id: 's4', name: 'Business analysis',       level: 'Intermediate' as const },
  ],
  languages: [
    { id: 'l1', name: 'Russian',  level: 'Native speaker' as const },
    { id: 'l2', name: 'English',  level: 'Highly proficient' as const },
    { id: 'l3', name: 'German',   level: 'Beginner' as const },
  ],
  awards: [
    { id: 'a1', title: 'Prize-winner, All-Russian Mathematics Olympiad', year: '2025', description: '3rd place at the regional stage' },
    { id: 'a2', title: 'RoboCup Junior 2025',                            year: '2025', description: '3rd place — Soccer Lightweight category' },
  ],
  volunteering: [
    { id: 'v1', title: 'Math Club for grades 5–7', year: '2024–2025', description: 'Led weekly olympiad-prep sessions for younger students at my school.' },
  ],
  olympiads: [],
  conferences: [],
  hobbies: [
    { id: 'h1', name: 'Chess (1st category)' },
    { id: 'h2', name: 'Robotics' },
    { id: 'h3', name: 'Snowboarding' },
  ],
}

/* ─── Стипендии (полная инфа для /demo/scholarships) ─── */
export const DEMO_SCHOLARSHIPS_FULL = [
  {
    id: 'demo-s1',
    title: 'Edinburgh Global Undergraduate Mathematics Scholarships',
    institution: 'University of Edinburgh',
    country: 'Великобритания',
    flag: '🇬🇧',
    amount: '£5,000 / год',
    deadline: '2026-03-31',
    level: 'Undergraduate',
    fundingType: 'Partial',
    description: 'Стипендия для иностранных студентов, поступающих на программы по математике в University of Edinburgh. Покрывает £5 000 / год обучения, продлевается ежегодно при поддержании высокого GPA.',
    eligibility: 'Иностранные студенты (non-UK/EU), поступающие на BSc Mathematics. GPA ≥ 4.5, IELTS 6.5+.',
    status: 'preparing',
  },
  {
    id: 'demo-s2',
    title: 'Rosedale OSSD University of Edinburgh Scholarship',
    institution: 'University of Edinburgh',
    country: 'Великобритания',
    flag: '🇬🇧',
    amount: '£10,000 / год',
    deadline: '2026-04-30',
    level: 'Undergraduate',
    fundingType: 'Partial',
    description: 'Партнёрская стипендия для выпускников Rosedale OSSD (Ontario Secondary School Diploma) программ. Покрывает £10 000 / год.',
    eligibility: 'Выпускники Rosedale OSSD программ. GPA ≥ 90% по предметам.',
    status: 'preparing',
  },
  {
    id: 'demo-s3',
    title: "Haworth Charitable Trust Manchester's Artist Community Studio Space Scholarship",
    institution: 'University of Manchester',
    country: 'Великобритания',
    flag: '🇬🇧',
    amount: '£8,000 / год',
    deadline: null,
    level: 'Undergraduate',
    fundingType: 'Partial',
    description: 'Стипендия + студийное пространство для иностранных студентов на программах по визуальному искусству и архитектуре в Манчестере.',
    eligibility: 'Иностранные студенты, поступающие на BA Architecture, Fine Art или связанные программы.',
    status: 'preparing',
  },
]

