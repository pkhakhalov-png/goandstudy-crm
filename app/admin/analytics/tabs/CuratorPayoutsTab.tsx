'use client'

import { C } from '../lib/theme'
import { money, monthFull } from '../lib/format'
import { Card, SectionTitle, EmptyState, Kpi, GridCols } from '../components/ui'
import { plural } from '../../plural'

const PAYOUTS: [string, string, string] = ['выплата', 'выплаты', 'выплат']
const CURATORS: [string, string, string] = ['куратор', 'куратора', 'кураторов']

// Прогноз вторых выплат кураторам (остаток «этап 2», 25 000 ₽), сгруппированный по
// ориентировочному месяцу оффера клиента. Только чтение — существующие цифры
// аналитики и расходов не затрагиваются.

interface Row {
  expenseId: string
  clientId: number
  clientName: string
  country: string
  curator: string
  amount: number
  month: string | null // 'YYYY-MM' | null
  status: string | null
}

interface Bucket {
  key: string          // 'YYYY-MM' | '—'
  label: string
  total: number
  rows: Row[]
  byCurator: { curator: string; amount: number; count: number }[]
}

function buildBuckets(rows: Row[]): Bucket[] {
  const map = new Map<string, Row[]>()
  for (const r of rows) {
    const k = r.month || '—'
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(r)
  }
  const keys = [...map.keys()].sort((a, b) => {
    if (a === '—') return 1
    if (b === '—') return -1
    return a < b ? -1 : a > b ? 1 : 0
  })
  return keys.map(k => {
    const bucketRows = map.get(k)!.sort((a, b) => a.curator.localeCompare(b.curator, 'ru'))
    const curMap = new Map<string, { amount: number; count: number }>()
    for (const r of bucketRows) {
      const cur = curMap.get(r.curator) || { amount: 0, count: 0 }
      cur.amount += r.amount
      cur.count += 1
      curMap.set(r.curator, cur)
    }
    return {
      key: k,
      label: k === '—' ? 'Без даты' : monthFull(k),
      total: bucketRows.reduce((s, r) => s + r.amount, 0),
      rows: bucketRows,
      byCurator: [...curMap.entries()]
        .map(([curator, v]) => ({ curator, ...v }))
        .sort((a, b) => b.amount - a.amount),
    }
  })
}

export function CuratorPayoutsTab({ data }: { data: any }) {
  const rows: Row[] = data?.rows ?? []
  const buckets = buildBuckets(rows)

  const total = rows.reduce((s, r) => s + r.amount, 0)
  const dated = rows.filter(r => r.month)
  const undated = rows.length - dated.length
  const curatorsCount = new Set(rows.map(r => r.curator)).size

  if (!rows.length) {
    return (
      <Card>
        <EmptyState
          title="Нет запланированных вторых выплат"
          text="Здесь появятся остатки (этап 2, 25 000 ₽) по клиентам, где вторая выплата куратору ещё не проведена. Проставьте месяц оффера в карточке клиента, чтобы увидеть прогноз по месяцам."
        />
      </Card>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <GridCols cols="1fr 1fr 1fr">
        <Kpi label="Всего к выплате (остатки)" value={money(total)} hint={`${plural(rows.length, PAYOUTS)} · ${plural(curatorsCount, CURATORS)}`} />
        <Kpi label="С датой оффера" value={money(dated.reduce((s, r) => s + r.amount, 0))} hint={plural(dated.length, PAYOUTS)} hintColor={C.good} />
        <Kpi label="Без даты оффера" value={money(rows.reduce((s, r) => s + (r.month ? 0 : r.amount), 0))} hint={`${plural(undated, PAYOUTS)} — нужен месяц`} hintColor={undated ? C.warn : C.muted} />
      </GridCols>

      {buckets.map(b => (
        <Card key={b.key}>
          <SectionTitle
            title={b.label}
            subtitle={`${plural(b.rows.length, PAYOUTS)} · ${plural(b.byCurator.length, CURATORS)}`}
            right={<span style={{ fontSize: 18, fontWeight: 600, color: b.key === '—' ? C.warn : C.text, fontVariantNumeric: 'tabular-nums' }}>{money(b.total)}</span>}
          />

          {/* Свод по кураторам за месяц */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '12px 0 4px' }}>
            {b.byCurator.map(cur => (
              <span key={cur.curator} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.chipBg, border: `1px solid ${C.border}`, borderRadius: 20, padding: '5px 12px', fontSize: 13 }}>
                <b style={{ color: C.text }}>{cur.curator}</b>
                <span style={{ color: C.text2, fontVariantNumeric: 'tabular-nums' }}>{money(cur.amount)}</span>
                <span style={{ color: C.muted, fontSize: 11 }}>×{cur.count}</span>
              </span>
            ))}
          </div>

          {/* Список клиентов */}
          <div style={{ marginTop: 12 }}>
            {b.rows.map((r, i) => (
              <div key={r.expenseId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '9px 0', borderTop: i ? `1px solid ${C.divider}` : 'none' }}>
                <span style={{ color: C.text, fontWeight: 500 }}>{r.clientName}{r.country ? <span style={{ color: C.muted, fontWeight: 400 }}> · {r.country}</span> : null}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ color: C.text2 }}>{r.curator}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 96, textAlign: 'right' }}>{money(r.amount)}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}
