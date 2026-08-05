'use client'

import { C, SERIES } from '../lib/theme'
import { money, pct } from '../lib/format'
import { Card, SectionTitle, EmptyState, GridCols } from '../components/ui'
import { Donut } from '../components/Donut'
import { SalesDynamicsChart } from '../components/charts'
import type { Period } from '../lib/period'

export function SalesTab({ data }: { data: any; period: Period }) {
  const rows: any[] = data?.rows ?? []
  const revenue = rows.filter(r => r.collected > 0).map((r, i) => ({ name: r.name, value: Number(r.collected), color: SERIES[i % SERIES.length] }))
  const totalCollected = rows.reduce((s, r) => s + Number(r.collected || 0), 0)

  return (
    <>
      <Card>
        <SectionTitle title="Рейтинг менеджеров" subtitle="Сортировка по сборам за период" />
        {rows.length ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr .8fr .8fr 1fr .9fr .9fr', gap: 14, padding: '0 4px 10px', borderBottom: `1px solid ${C.grid}`, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: C.weak }}>
              <div>Менеджер</div><div style={{ textAlign: 'center' }}>Сделки</div><div style={{ textAlign: 'center' }}>Конв.</div>
              <div style={{ textAlign: 'right' }}>Сборы</div><div style={{ textAlign: 'right' }}>Просрочка</div><div style={{ textAlign: 'right' }}>Комиссия</div>
            </div>
            {rows.map((r, i) => {
              const conv = r.total_deals > 0 ? Math.round(r.converted / r.total_deals * 100) : 0
              const convColor = conv >= 32 ? C.good : conv >= 25 ? C.warn : C.danger
              const planPct = r.plan > 0 ? Math.round(r.collected / r.plan * 100) : 0
              return (
                <div key={r.salesperson_id} style={{ display: 'grid', gridTemplateColumns: '1.5fr .8fr .8fr 1fr .9fr .9fr', gap: 14, alignItems: 'center', padding: '13px 4px', borderBottom: `1px solid ${C.divider}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 32, height: 32, borderRadius: '50%', background: SERIES[i % SERIES.length], color: '#fff', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {(r.name || '—').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{r.name}</span>
                  </div>
                  <div style={{ textAlign: 'center', fontSize: 13 }}>{r.new_deals}</div>
                  <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 500, color: convColor }}>{pct(conv)}</div>
                  <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(r.collected)}</div>
                  <div style={{ textAlign: 'right', fontSize: 13, color: r.overdue > 150000 ? C.danger : r.overdue > 0 ? C.warn : C.weak, fontVariantNumeric: 'tabular-nums' }}>{r.overdue > 0 ? money(r.overdue) : '—'}</div>
                  <div style={{ textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{money(r.commission)}</div>
                  <div style={{ gridColumn: '1 / -1', fontSize: 11, color: C.weak }}>
                    {r.plan > 0 ? `план-факт ${planPct}% от ${money(r.plan)}` : 'план не задан'}
                  </div>
                </div>
              )
            })}
          </div>
        ) : <EmptyState text="Нет данных по продажникам за период." />}
      </Card>

      <GridCols cols="1fr 1.4fr" style={{ alignItems: 'start' }}>
        <Card>
          <SectionTitle title="Выручка по менеджерам" />
          {revenue.length ? <Donut data={revenue} size={172} centerValue={money(totalCollected)} centerLabel="сборы" showAmounts={false} />
            : <EmptyState text="Поступлений за период нет." />}
        </Card>
        <Card>
          <SectionTitle title="Динамика сборов по менеджерам" subtitle="Топ-4, помесячно" />
          {(data?.dynamics ?? []).some((d: any) => (d.series || []).some((p: any) => p.v > 0))
            ? <SalesDynamicsChart dynamics={data.dynamics} />
            : <EmptyState text="Пока недостаточно истории для динамики." />}
        </Card>
      </GridCols>
    </>
  )
}
