// Резолв периода: пресет|произвольный диапазон → {from, to} (YYYY-MM-DD).
// Используется и на сервере (page.tsx), и в шелле (для подписей).

export type Preset = 'month' | 'prev' | 'quarter' | 'year' | 'custom'
export type Tab = 'money' | 'sales' | 'curators' | 'forecast' | 'payouts'

export interface Period { preset: Preset; from: string; to: string }

const iso = (d: Date) => d.toISOString().slice(0, 10)

export function resolvePeriod(sp: { preset?: string; from?: string; to?: string }, today = new Date()): Period {
  const y = today.getFullYear()
  const m = today.getMonth()

  if (sp.from && sp.to) return { preset: 'custom', from: sp.from, to: sp.to }

  const preset = (sp.preset as Preset) || 'month'
  switch (preset) {
    case 'prev': {
      const from = new Date(y, m - 1, 1)
      const to = new Date(y, m, 0)
      return { preset, from: iso(from), to: iso(to) }
    }
    case 'quarter': {
      const q = Math.floor(m / 3)
      const from = new Date(y, q * 3, 1)
      const to = new Date(y, q * 3 + 3, 0)
      return { preset, from: iso(from), to: iso(to) }
    }
    case 'year':
      return { preset, from: `${y}-01-01`, to: `${y}-12-31` }
    case 'month':
    default: {
      const from = new Date(y, m, 1)
      const to = new Date(y, m + 1, 0)
      return { preset: 'month', from: iso(from), to: iso(to) }
    }
  }
}

export const PRESETS: { key: Preset; label: string }[] = [
  { key: 'month', label: 'Этот месяц' },
  { key: 'prev', label: 'Прошлый месяц' },
  { key: 'quarter', label: 'Квартал' },
  { key: 'year', label: 'Год' },
]

export const TABS: { key: Tab; label: string }[] = [
  { key: 'money', label: 'Деньги' },
  { key: 'sales', label: 'Продажники' },
  { key: 'curators', label: 'Кураторы' },
  { key: 'forecast', label: 'Прогноз' },
  { key: 'payouts', label: 'Выплаты кураторам' },
]
