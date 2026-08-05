// Дизайн-токены модуля аналитики (из design_handoff_analytics/README.md).
// Единый источник цветов/палитры для всех вкладок и чартов.

export const C = {
  bg: '#f4f4f1',
  card: '#ffffff',
  border: '#e6e5e0',
  ctrlBorder: '#e3e2dd',
  ctrlBorder2: '#dcdbd5',
  divider: '#f3f3f0',
  grid: '#eeeeea',
  track: '#ebebe7',
  emptySeg: '#ededea',
  chipBg: '#f6f6f3',
  rowHover: '#faf9f7',

  text: '#16181a',
  text2: '#4a4e47',
  text3: '#6f736c',
  muted: '#8b8f87',
  weak: '#9a9e97',
  weak2: '#a2a6a0',

  good: '#2f7d5d',
  good2: '#5aa37f',
  good3: '#8fc0a9',
  goodBg: '#f0f6f2',
  warn: '#d9a13a',
  warn2: '#e8c07a',
  warnBg: '#fdf5e6',
  warnText: '#a97b1e',
  danger: '#c74b3d',
  dangerBg: '#fbecea',
  neutral: '#c3c6bf',
  neutral2: '#9ba098',
} as const

// Палитра серий (донаты/линии) — строго по порядку из хендоффа.
export const SERIES = ['#2f7d5d', '#5aa37f', '#d9a13a', '#c74b3d', '#9ba098', '#8fc0a9', '#e8c07a', '#7d8b84', '#bfb8a6']

export const CARD_SHADOW = '0 1px 2px rgba(20,22,18,.04), 0 10px 26px -16px rgba(20,22,18,.14)'
export const RADIUS = { marker: 3, sm: 4, btn: 8, chip: 10, card: 14, badge: 20 }

// Порог загрузки куратора → цвет.
export function loadColor(pct: number): string {
  if (pct > 90) return C.danger
  if (pct >= 70) return C.warn
  return C.good
}
export function loadLabel(pct: number): string {
  if (pct > 90) return 'перегрузка'
  if (pct >= 70) return 'высокая загрузка'
  return 'есть запас'
}

// Цвет факта в барчарте: факт≥план → good, ≥90% плана → good2, иначе warn.
export function factColor(fact: number, plan: number): string {
  if (plan <= 0) return C.good2
  if (fact >= plan) return C.good
  if (fact >= plan * 0.9) return C.good2
  return C.warn
}
