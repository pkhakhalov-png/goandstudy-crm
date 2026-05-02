// Дорожная карта клиента: гибкая структура — массив стадий, у каждой
// заголовок (можно править/удалять/добавлять) и список пунктов внутри.
// Хранится в clients.roadmap_data как объект { stages: [...] }.

export type RoadmapItem = {
  id: string
  title: string
  month?: string      // YYYY-MM
  comment?: string
  done?: boolean
}

export type RoadmapStage = {
  id: string
  title: string
  month?: string         // YYYY-MM — общая дата этапа (опционально)
  done?: boolean         // этап выполнен целиком
  items: RoadmapItem[]
}

export type RoadmapData = {
  stages: RoadmapStage[]
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

// Дефолтный шаблон — наполняется при первом открытии (если roadmap_data пуст).
// Куратор всё может удалить/переименовать/добавить.
export const DEFAULT_ROADMAP_TEMPLATE: { title: string; items: { title: string }[] }[] = [
  { title: 'Стратегическая сессия', items: [] },
  { title: 'Поиск университетов и программ', items: [] },
  { title: 'Презентация и выбор приоритетных вузов', items: [] },
  { title: 'Подготовка документов', items: [
    { title: 'Академические документы' },
    { title: 'Мотивационное письмо' },
    { title: 'Резюме' },
    { title: 'Сдача языкового экзамена' },
    { title: 'Другие документы' },
  ] },
  { title: 'Перевод документов', items: [] },
  { title: 'Легализация документов', items: [] },
  { title: 'Зачисление', items: [
    { title: 'Создание ЛК' },
    { title: 'Заполнение ЛК' },
    { title: 'Отправка заявки' },
  ] },
  { title: 'Получение приглашения', items: [] },
  { title: 'Проживание', items: [] },
  { title: 'Виза', items: [] },
  { title: 'Подготовка к поездке', items: [] },
]
