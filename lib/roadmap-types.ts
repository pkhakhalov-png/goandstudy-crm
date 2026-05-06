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
  /** Куратор отправил клиенту на подтверждение. До этого клиент карту не видит. */
  sent_at?: string | null
  sent_by_name?: string | null
}

const RU_MONTH_SHORT: Record<string, string> = {
  '01': 'янв', '02': 'фев', '03': 'мар', '04': 'апр', '05': 'май', '06': 'июн',
  '07': 'июл', '08': 'авг', '09': 'сен', '10': 'окт', '11': 'ноя', '12': 'дек',
}

export function formatRoadmapMonth(month?: string): string {
  if (!month) return ''
  const [y, m] = month.split('-')
  if (!y || !m) return month
  const ym = RU_MONTH_SHORT[m] || m
  return `${ym} ${y}`
}

// Дефолтный шаблон — наполняется при первом открытии (если roadmap_data пуст).
// Куратор всё может удалить/переименовать/добавить.
export const DEFAULT_ROADMAP_TEMPLATE: { title: string; items: { title: string }[] }[] = [
  { title: 'Профориентация',  items: [] },
  { title: 'Стратсессия',     items: [] },
  { title: 'Дорожная карта',  items: [] },
  { title: 'Подбор вузов',    items: [] },
  { title: 'Презентация',     items: [] },
  { title: 'Документы',       items: [] },
  { title: 'Подача',          items: [] },
  { title: 'Оффер',           items: [] },
  { title: 'Зачисление',      items: [] },
  { title: 'Жильё',           items: [] },
  { title: 'Виза',            items: [] },
  { title: 'Поездка',         items: [] },
]
