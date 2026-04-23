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
  lockedHint?: string // для status: 'locked' — что разблокирует
}

export const REQUIRED_DOCS: RequiredDoc[] = [
  { key: 'passport', title: 'Паспорт', hint: 'Заграничный, скан первой страницы', status: 'uploaded', fileName: 'passport.pdf', fileSize: '2.0 МБ' },
  { key: 'academic', title: 'Академические документы', hint: 'Транскрипт, дипломы, выписки оценок', status: 'pending', hasExample: true, exampleTitle: 'Академические документы — образец' },
  { key: 'language', title: 'Языковой тест', hint: 'IELTS или TOEFL сертификат', status: 'missing', hasExample: true, exampleTitle: 'Требования к языковому тесту' },
  { key: 'certificate', title: 'Аттестат', hint: 'Школьный аттестат с приложением оценок', status: 'pending' },
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
  program: string
  match: number
  reason: string
}

export const SHORTLIST_TOP: University[] = [
  { key: 'edinburgh', name: 'University of Edinburgh', city: 'Эдинбург', country: 'UK', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', program: 'BSc Computer Science', match: 92, reason: 'Сильная CS-программа, приемлемая финансовая нагрузка при раннем решении.' },
  { key: 'tudelft', name: 'TU Delft', city: 'Делфт', country: 'Нидерланды', flag: '🇳🇱', program: 'BSc CS & Engineering', match: 88, reason: 'Англоязычная программа, сильная технологическая сеть.' },
  { key: 'kth', name: 'KTH Royal Institute', city: 'Стокгольм', country: 'Швеция', flag: '🇸🇪', program: 'BSc ICT', match: 85, reason: 'Бесплатно для EU / EEA, сильная партнёрская сеть.' },
]

export const SHORTLIST_TOTAL = 11

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

export type EssayState = 'not_started' | 'in_progress' | 'ready'

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
