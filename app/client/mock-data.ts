/**
 * Mock данные для ЛК клиента. Пока нет реальной схемы client_*
 * в Supabase — источник правды здесь. Структура полей совпадает с будущей
 * БД, поэтому при переходе на живые данные меняется только источник
 * (импорты в page.tsx), а компоненты остаются неизменными.
 */

export type DocStatus = 'uploaded' | 'missing' | 'pending' | 'optional' | 'locked'

export type RequiredDoc = {
  key: string
  title: string
  hint?: string
  status: DocStatus
  fileName?: string
  fileSize?: string
  hasExample?: boolean
  exampleTitle?: string
  /** Путь к образцу в /public/samples/ (PDF / JPG / PNG). Если задан — модалка показывает превью вместо плейсхолдера. */
  samplePath?: string
  lockedHint?: string // для status: 'locked' — что разблокирует
  href?: string // если задан — клик на карточку ведёт сюда (вместо модалки)
}

export const REQUIRED_DOCS: RequiredDoc[] = [
  { key: 'passport', title: 'Паспорт', hint: 'Заграничный, скан первой страницы', status: 'pending', hasExample: true, exampleTitle: 'Паспорт — образец', samplePath: '/samples/passport.jpg' },
  { key: 'diploma', title: 'Диплом', hint: 'Диплом о высшем/среднем образовании', status: 'pending', hasExample: true, exampleTitle: 'Диплом — образец', samplePath: '/samples/diploma.jpg' },
  { key: 'transcript', title: 'Транскрипт', hint: 'Выписка оценок (с переводом если требуется)', status: 'pending', hasExample: true, exampleTitle: 'Транскрипт — образец', samplePath: '/samples/transcript.jpg' },
  { key: 'attestat', title: 'Аттестат', hint: 'Школьный аттестат с приложением оценок', status: 'pending', hasExample: true, exampleTitle: 'Аттестат — образец', samplePath: '/samples/attestat.jpeg' },
  { key: 'ielts', title: 'IELTS / TOEFL', hint: 'Сертификат языкового теста', status: 'missing', hasExample: true, exampleTitle: 'IELTS — образец', samplePath: '/samples/ielts.jpg' },
  { key: 'recommendation', title: 'Рекомендательное письмо', hint: 'От школы / преподавателя / работодателя', status: 'pending', hasExample: true, exampleTitle: 'Рекомендательное письмо — образец', samplePath: '/samples/recomm.pdf' },
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

export type OptionalDoc = {
  key: string
  title: string
  fileName?: string
  fileSize?: string
}

export const OPTIONAL_DOCS: OptionalDoc[] = [
  { key: 'ielts', title: 'Сертификат IELTS 7.5', fileName: 'ielts.pdf', fileSize: '0.8 МБ' },
  { key: 'portfolio', title: 'Портфолио работ', fileName: 'portfolio.pdf', fileSize: '4.2 МБ' },
]

export type TimelineStage = {
  key: string
  num: number
  title: string
  state: 'done' | 'current' | 'upcoming'
  progress?: number
}

export const TIMELINE_STAGES: TimelineStage[] = [
  { key: 'intro', num: 1, title: 'Знакомство', state: 'done' },
  { key: 'shortlist', num: 2, title: 'Подбор вузов', state: 'current', progress: 35 },
  { key: 'documents', num: 3, title: 'Документы', state: 'upcoming' },
  { key: 'apply', num: 4, title: 'Подача заявок', state: 'upcoming' },
  { key: 'offers', num: 5, title: 'Офферы и визы', state: 'upcoming' },
]

export type Task = {
  key: string
  title: string
  dueDate?: string
  done?: boolean
}

export const TASKS: Task[] = [
  { key: 'photo', title: 'Отправить фото 2×2 см (белый фон, без очков)', dueDate: '25.04' },
  { key: 'confirm-list', title: 'Подтвердить финальный список вузов', dueDate: '27.04' },
  { key: 'toefl', title: 'Записаться на пробный TOEFL', done: true },
  { key: 'visa-contract', title: 'Подписать договор о сопровождении визы', dueDate: '30.04' },
]

export type University = {
  key: string
  name: string
  city: string
  country: string
  flag: string
  logoUrl?: string | null // реальное лого из парсер-базы
  programId?: number | null
  schoolId?: number | null
  program: string
  tuition?: string
  match: number
  reason: string
  tags?: string[] // Scholarship, English-taught, EU, etc
}

/**
 * Полная подборка от куратора — 15 программ.
 * Клиент выбирает из них 3 приоритетные (state хранится в shared-store).
 */
export const CURATOR_SHORTLIST: University[] = [
  { key: 'edinburgh', name: 'University of Edinburgh', city: 'Эдинбург', country: 'UK', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', program: 'BSc Computer Science', tuition: '£26 500 / год', match: 92, reason: 'Сильная CS-программа, приемлемая финансовая нагрузка при раннем решении.', tags: ['UK', 'English'] },
  { key: 'imperial', name: 'Imperial College London', city: 'Лондон', country: 'UK', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', program: 'BSc Computing', tuition: '£40 940 / год', match: 90, reason: 'Топ-5 мира по CS. Высокий порог поступления, но при профиле Игоря реально.', tags: ['Top-10', 'UK'] },
  { key: 'tudelft', name: 'TU Delft', city: 'Делфт', country: 'Нидерланды', flag: '🇳🇱', program: 'BSc CS & Engineering', tuition: '€19 100 / год', match: 88, reason: 'Англоязычная программа, сильная технологическая сеть.', tags: ['NL', 'English'] },
  { key: 'warwick', name: 'University of Warwick', city: 'Ковентри', country: 'UK', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', program: 'BSc Computer Science', tuition: '£29 830 / год', match: 87, reason: 'Top-10 UK по CS, сильная математическая подготовка студентов.', tags: ['UK'] },
  { key: 'kth', name: 'KTH Royal Institute of Technology', city: 'Стокгольм', country: 'Швеция', flag: '🇸🇪', program: 'BSc Information & Communication Technology', tuition: '€0 (для EU/EEA) / €12 500 non-EU', match: 85, reason: 'Бесплатно для EU/EEA, сильная партнёрская сеть со шведским tech.', tags: ['Scholarship', 'EU'] },
  { key: 'amsterdam', name: 'University of Amsterdam', city: 'Амстердам', country: 'Нидерланды', flag: '🇳🇱', program: 'BSc Artificial Intelligence', tuition: '€16 170 / год', match: 83, reason: 'Одна из сильнейших AI-программ в EU, интенсивная математика.', tags: ['NL', 'AI'] },
  { key: 'tum', name: 'Technical University of Munich', city: 'Мюнхен', country: 'Германия', flag: '🇩🇪', program: 'BSc Informatik', tuition: '€4 000 / семестр', match: 82, reason: 'Недорого, сильная инженерная школа, но преподавание частично на немецком.', tags: ['DE', 'Low-cost'] },
  { key: 'aalto', name: 'Aalto University', city: 'Эспоо', country: 'Финляндия', flag: '🇫🇮', program: 'BSc Data Science', tuition: '€15 000 / год (non-EU)', match: 81, reason: 'Сильная дата-сцена, эргономичный кампус, прозрачная admission политика.', tags: ['FI', 'EU'] },
  { key: 'manchester', name: 'University of Manchester', city: 'Манчестер', country: 'UK', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', program: 'BSc Computer Science', tuition: '£32 000 / год', match: 80, reason: 'Большая школа CS, много специализаций на 3-м курсе.', tags: ['UK'] },
  { key: 'southampton', name: 'University of Southampton', city: 'Саутгемптон', country: 'UK', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', program: 'MEng Computer Science', tuition: '£27 400 / год', match: 79, reason: 'Интегрированный мастер, можно закончить сразу с MSc уровнем.', tags: ['UK', '4-year'] },
  { key: 'copenhagen', name: 'University of Copenhagen', city: 'Копенгаген', country: 'Дания', flag: '🇩🇰', program: 'BSc Computer Science', tuition: '€12 500 / год (non-EU)', match: 78, reason: 'Высокое качество жизни, сильные кейсы для Nordic tech companies.', tags: ['DK'] },
  { key: 'chalmers', name: 'Chalmers University of Technology', city: 'Гётеборг', country: 'Швеция', flag: '🇸🇪', program: 'BSc Computer Science & Engineering', tuition: '€16 400 / год (non-EU)', match: 77, reason: 'Инженерный фокус, хорошие связи с Volvo и Ericsson.', tags: ['SE'] },
  { key: 'trinity', name: 'Trinity College Dublin', city: 'Дублин', country: 'Ирландия', flag: '🇮🇪', program: 'BAI Computer Engineering', tuition: '€28 500 / год', match: 76, reason: 'Англоязычная, входит в EU — упрощает визу и будущую работу в Европе.', tags: ['IE', 'EU'] },
  { key: 'polimi', name: 'Politecnico di Milano', city: 'Милан', country: 'Италия', flag: '🇮🇹', program: 'BSc Computer Science Engineering', tuition: '€3 900 / год', match: 74, reason: 'Дешёвое обучение, сильный бренд в инженерии, часть программ на английском.', tags: ['IT', 'Low-cost', 'EU'] },
  { key: 'ethz', name: 'ETH Zürich', city: 'Цюрих', country: 'Швейцария', flag: '🇨🇭', program: 'BSc Informatik', tuition: 'CHF 1 460 / семестр', match: 72, reason: 'Топ-3 мира по CS, очень сложное поступление. Safety-план Б.', tags: ['Top-5', 'Low-cost'] },
]

/** Для удобства: сколько всего в подборке от куратора. */
export const SHORTLIST_TOTAL = CURATOR_SHORTLIST.length

/**
 * Сколько приоритетных программ показывается на главной /client.
 * Полный список приоритетов (сколько клиент отметил) видно в /client/shortlist.
 */
export const MAIN_PAGE_PRIORITY_LIMIT = 3

export type Curator = {
  name: string
  initials: string
  role: string
  nextMeeting: string
  online: boolean
}

export const CURATOR: Curator = {
  name: 'Анна Петрова',
  initials: 'АП',
  role: '7 лет опыта · UK / EU',
  nextMeeting: 'Четверг, 26 апреля · 18:00',
  online: true,
}

export type RoadmapItem = {
  key: string
  title: string
  date: string
  done: boolean
  current?: boolean
}

export type RoadmapStage = {
  stageKey: string
  stageName: string
  items: RoadmapItem[]
}

export const ROADMAP: RoadmapStage[] = [
  {
    stageKey: 'intro',
    stageName: 'Знакомство',
    items: [
      { key: '1', title: 'Консультация с куратором', date: '03.02', done: true },
      { key: '2', title: 'Заполнение анкеты клиента', date: '05.02', done: true },
      { key: '3', title: 'Стратегическая сессия', date: '08.02', done: true },
    ],
  },
  {
    stageKey: 'shortlist',
    stageName: 'Подбор вузов',
    items: [
      { key: '4', title: 'Первичная подборка', date: '15.04', done: true },
      { key: '5', title: 'Ревью с клиентом', date: '22.04', done: true },
      { key: '6', title: 'Финальный shortlist', date: '03.05', done: false, current: true },
    ],
  },
  {
    stageKey: 'documents',
    stageName: 'Документы',
    items: [
      { key: '7', title: 'Сбор обязательных документов', date: 'май', done: false },
      { key: '8', title: 'Мотивационные письма', date: 'июнь', done: false },
      { key: '9', title: 'Рекомендации', date: 'июнь', done: false },
    ],
  },
  {
    stageKey: 'apply',
    stageName: 'Подача заявок',
    items: [
      { key: '10', title: 'Заявки в UK вузы', date: 'окт', done: false },
      { key: '11', title: 'Заявки в EU вузы', date: 'янв 2027', done: false },
    ],
  },
  {
    stageKey: 'offers',
    stageName: 'Офферы и визы',
    items: [
      { key: '12', title: 'Ожидание офферов', date: 'апр 2027', done: false },
      { key: '13', title: 'Выбор вуза', date: 'июн 2027', done: false },
      { key: '14', title: 'Подача на визу', date: 'июл 2027', done: false },
    ],
  },
]

export type StudentProjectField = {
  key: 'level' | 'specialty' | 'location' | 'budget' | 'startDate' | 'english' | 'education' | 'other'
  label: string
  value: string
  multiline?: boolean
}

export type StudentProject = {
  fields: StudentProjectField[]
  note: string
  updatedBy: string
  updatedAt: string
}

export const STUDENT_PROJECT: StudentProject = {
  fields: [
    { key: 'level',     label: 'Уровень',       value: 'Магистратура' },
    { key: 'specialty', label: 'Специальность', value: 'product design, product management, interaction design, Industrial Design', multiline: true },
    { key: 'location',  label: 'Локация',       value: 'Италия, Австрия, Нидерланды, Швейцария, Бельгия, возможно Швеция и Германия', multiline: true },
    { key: 'budget',    label: 'Бюджет',        value: 'до 17 000 € в год' },
    { key: 'startDate', label: 'Начало учёбы',  value: 'осень 2027' },
    { key: 'english',   label: 'Английский',    value: 'IELTS примерно 7.0' },
    { key: 'education', label: 'Образование',   value: 'Бауманка, МИСИС. 2 года технические предметы, 2 года digital design; 4.20 / 5', multiline: true },
    { key: 'other',     label: 'Иное',          value: 'Есть портфолио из Яндекс.Школы. Рассматриваем топовые вузы с хорошим рейтингом по специальности.', multiline: true },
  ],
  note: 'Александр, спасибо за встречу! Зафиксировали направление и бюджет, дальше я готовлю первичную подборку вузов к 15 апреля и шлю тебе на ревью.',
  updatedBy: 'Куратор Анна Петрова',
  updatedAt: '08.02.2026',
}

export type EssayState = 'not_started' | 'in_progress' | 'sent' | 'editing' | 'ready'

export type Essay = {
  key: string
  title: string
  subtitle: string
  emoji: string // ЧБ emoji, рендерим с filter: grayscale(1)
  state: EssayState
  updatedAt?: string
}

export const ESSAYS: Essay[] = [
  { key: 'resume', title: 'Резюме', subtitle: 'Академический и внеклассный опыт, портфолио', emoji: '📋', state: 'not_started' },
  { key: 'motivation', title: 'Мотивационное письмо', subtitle: 'Почему именно эти вузы и эта программа', emoji: '✍️', state: 'not_started' },
]

export type ClientContext = {
  parentName: string
  parentFirstName: string
  childFirstName: string
  childFullName: string
  intakeYear: number
  startedAt: string
  nextMilestone: string
  nextMilestoneDate: string
}

export const CLIENT_CTX: ClientContext = {
  parentName: 'Мария Иванова',
  parentFirstName: 'Мария',
  childFirstName: 'Игорь',
  childFullName: 'Игорь Иванов',
  intakeYear: 2027,
  startedAt: '3 февраля',
  nextMilestone: 'финальный shortlist',
  nextMilestoneDate: '3 мая',
}
