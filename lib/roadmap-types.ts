// Дорожная карта клиента — типы и константы (без server-only кода).

export type RoadmapSubstage = { key: string; label: string }

export type RoadmapStageDef = {
  key: string
  label: string
  substages?: RoadmapSubstage[]
}

export const ROADMAP_STAGES: RoadmapStageDef[] = [
  { key: 'strategy_session',  label: 'Стратегическая сессия' },
  { key: 'university_search', label: 'Поиск университетов и программ' },
  { key: 'presentation',      label: 'Презентация и выбор приоритетных вузов' },
  {
    key: 'documents',
    label: 'Подготовка документов',
    substages: [
      { key: 'academic',      label: 'Академические документы' },
      { key: 'motivation',    label: 'Мотивационное письмо' },
      { key: 'resume',        label: 'Резюме' },
      { key: 'language_exam', label: 'Сдача языкового экзамена' },
      { key: 'other_docs',    label: 'Другие документы' },
    ],
  },
  { key: 'translation',  label: 'Перевод документов' },
  { key: 'legalization', label: 'Легализация документов' },
  {
    key: 'enrollment',
    label: 'Зачисление',
    substages: [
      { key: 'account_create', label: 'Создание ЛК' },
      { key: 'account_fill',   label: 'Заполнение ЛК' },
      { key: 'app_send',       label: 'Отправка заявки' },
    ],
  },
  { key: 'invitation', label: 'Получение приглашения' },
  { key: 'housing',    label: 'Проживание' },
  { key: 'visa',       label: 'Виза' },
  { key: 'trip_prep',  label: 'Подготовка к поездке' },
]

export type RoadmapStageKey = string  // не enum: расширяемо

export type RoadmapItemRow = {
  id: string
  stage: string                      // ключ стадии 1-го уровня
  substage?: string                  // опц. ключ подэтапа (если стадия имеет substages)
  title: string
  month?: string                     // YYYY-MM
  comment?: string
  done?: boolean
}

export type RoadmapApproval = {
  approved_at: string | null
  approved_by_name: string | null
}

const RU_MONTH_FULL: Record<string, string> = {
  '01': 'январь', '02': 'февраль', '03': 'март', '04': 'апрель',
  '05': 'май',     '06': 'июнь',    '07': 'июль', '08': 'август',
  '09': 'сентябрь','10': 'октябрь', '11': 'ноябрь', '12': 'декабрь',
}

const RU_MONTH_SHORT: Record<string, string> = {
  '01': 'янв', '02': 'фев', '03': 'мар', '04': 'апр', '05': 'май', '06': 'июн',
  '07': 'июл', '08': 'авг', '09': 'сен', '10': 'окт', '11': 'ноя', '12': 'дек',
}

const CURRENT_YEAR = new Date().getFullYear()

export function formatRoadmapMonth(month?: string): string {
  if (!month) return ''
  const [y, m] = month.split('-')
  if (!y || !m) return month
  const ym = RU_MONTH_SHORT[m] || m
  return Number(y) === CURRENT_YEAR ? ym : `${ym} ${y}`
}

export const MONTHS_FOR_PICKER = Object.entries(RU_MONTH_FULL).map(([num, label]) => ({ num, label }))

export function getYearsForPicker(): number[] {
  const start = CURRENT_YEAR
  const years: number[] = []
  for (let y = start; y <= start + 4; y++) years.push(y)
  return years
}
