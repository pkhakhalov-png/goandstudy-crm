/**
 * ХАРДКОД-ДАННЫЕ для /demo. НИКАКОЙ связи с БД.
 * Все правки клиента живут в sessionStorage и сбрасываются при закрытии вкладки.
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
    jobTitle: 'Школьник, 11 класс — готовлюсь к бакалавриату',
    firstName: 'Алексей',
    lastName: 'Демо',
    email: 'demo@goandstudy.com',
    phone: '+7 (900) 000-00-00',
    linkedIn: '',
    postcode: '125009',
    city: 'Москва',
    country: 'Россия',
    dateOfBirth: '2008-03-15',
    profileSummary: 'Школьник 11 класса со страстью к бизнесу и технологиям. Запустил собственное онлайн-репетиторство (80k ₽/мес). Капитан команды робототехники, призёр математической олимпиады. Готовлюсь к бакалавриату по management в Австрии или Германии.',
  },
  links: [
    { id: 'l1', title: 'GitHub', url: 'https://github.com/demo' },
  ],
  workExperience: [
    {
      id: 'w1',
      jobTitle: 'Основатель',
      company: 'Онлайн-репетиторство (свой проект)',
      city: 'Москва',
      startDate: '2024-09',
      endDate: 'present',
      description: 'Запустил с нуля платформу онлайн-репетиторства по математике для 7-9 классов. За 8 месяцев — 12 учеников, оборот 80 000 ₽/мес. Занимаюсь маркетингом (Instagram, ВКонтакте), отбором преподавателей и customer service.',
    },
    {
      id: 'w2',
      jobTitle: 'Стажёр Python QA',
      company: 'Локальная IT-компания',
      city: 'Москва',
      startDate: '2025-06',
      endDate: '2025-08',
      description: 'Написал автотесты на pytest для backend-микросервиса. Покрытие выросло с 35% до 71%. Получил рекомендацию от tech-lead.',
    },
  ],
  education: [
    {
      id: 'e1',
      school: 'Школа №1234 с углублённым изучением математики',
      degree: 'Средняя школа, 11 класс',
      startDate: '2018-09',
      endDate: '2026-06',
      city: 'Москва',
      description: 'Углублённая математика (5/5), физика (5/5), английский (С1). GPA 4.7/5.0. IELTS 7.0.',
    },
  ],
  courses: [
    { id: 'c1', title: 'Foundations of Business Strategy', city: 'Coursera (University of Virginia)', year: '2025', description: 'Сертификат, 4 модуля, оценка А.' },
  ],
  skills: [
    { id: 's1', name: 'Excel / Google Sheets', level: 'Intermediate' as const },
    { id: 's2', name: 'Python (базовый)', level: 'Beginner' as const },
    { id: 's3', name: 'Презентации (Keynote)', level: 'Advanced' as const },
    { id: 's4', name: 'Бизнес-анализ', level: 'Intermediate' as const },
  ],
  languages: [
    { id: 'l1', name: 'Русский', level: 'Native' as const },
    { id: 'l2', name: 'Английский', level: 'C1' as const },
    { id: 'l3', name: 'Немецкий', level: 'A2' as const },
  ],
  awards: [
    { id: 'a1', title: 'Призёр всероссийской олимпиады по математике', year: '2025', description: '3 место в региональном этапе' },
    { id: 'a2', title: 'RoboCup Junior 2025', year: '2025', description: '3 место в категории Soccer Lightweight' },
  ],
  volunteering: [
    { id: 'v1', title: 'Math Club для 5-7 классов', year: '2024-2025', description: 'Проводил еженедельные занятия по олимпиадной математике для младших классов школы.' },
  ],
  olympiads: [],
  conferences: [],
  hobbies: [
    { id: 'h1', name: 'Шахматы (1 разряд)' },
    { id: 'h2', name: 'Робототехника' },
    { id: 'h3', name: 'Сноубординг' },
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

