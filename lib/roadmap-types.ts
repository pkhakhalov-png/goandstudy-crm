// Дорожная карта клиента — типы и константы (без server-only кода).

export const ROADMAP_STAGES = [
  { key: 'intro',     label: 'Знакомство' },
  { key: 'shortlist', label: 'Подбор вузов' },
  { key: 'documents', label: 'Документы' },
  { key: 'apply',     label: 'Подача заявок' },
  { key: 'offers',    label: 'Офферы и визы' },
] as const

export type RoadmapStageKey = typeof ROADMAP_STAGES[number]['key']

export type RoadmapItemRow = {
  id: string
  stage: RoadmapStageKey
  title: string
  month?: string     // YYYY-MM, например "2026-05"
  comment?: string   // опциональный комментарий куратора
  done?: boolean
}

export type RoadmapApproval = {
  approved_at: string | null
  approved_by_name: string | null
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
