'use client'

import { C, loadColor, loadLabel } from '../lib/theme'
import { money, days, pct } from '../lib/format'
import { Card, Kpi, SectionTitle, EmptyState, GridCols } from '../components/ui'
import { Donut } from '../components/Donut'
import { CuratorStageStack } from '../components/charts'
import type { Period } from '../lib/period'

export function CuratorsTab({ data }: { data: any; period: Period }) {
  const k = data?.kpis ?? {}
  const load: any[] = (data?.load ?? []).filter((l: any) => l.is_active || l.active_clients > 0)

  const distribution = load
    .filter(l => l.active_clients > 0)
    .map(l => ({ name: l.name, value: l.active_clients }))

  return (
    <>
      {/* KPI */}
      <GridCols cols="repeat(3, minmax(0,1fr))">
        <Kpi label="Активных кураторов" value={String(k.active_curators ?? 0)} hint={`из ${k.total_curators ?? 0} в системе`} />
        <Kpi label="Активных клиентов" value={String(k.active_clients ?? 0)}
          hint={`${k.full_clients ?? 0} полное сопровождение · ${k.session_clients ?? 0} сессии`} />
        <Kpi label="Средняя загрузка" value={pct(k.avg_load ?? 0)} valueColor={loadColor(k.avg_load ?? 0)}
          progress={k.avg_load ?? 0} progressColor={loadColor(k.avg_load ?? 0)}
          hint={k.median_assign_to_roadmap_days != null ? `медиана назначение→роадмап: ${days(k.median_assign_to_roadmap_days)}` : undefined} />
      </GridCols>

      {/* Карточки загрузки кураторов */}
      <GridCols cols="repeat(3, minmax(0,1fr))">
        {load.map((l) => {
          const p = l.max_clients > 0 ? Math.round(l.active_clients / l.max_clients * 100) : 0
          const col = loadColor(p)
          return (
            <Card key={l.curator_id} style={{ padding: '18px 20px', display: 'flex', gap: 18, alignItems: 'center' }}>
              <Gauge pct={p} color={col} active={l.active_clients} max={l.max_clients} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{l.name}</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: col, marginBottom: 8 }}>{loadLabel(p)}</div>
                <Row label="Полное сопровождение" value={String(l.full_cnt)} />
                <Row label="Сессии" value={String(l.session_cnt)} />
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.divider}`, paddingTop: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 12, color: C.muted }}>Выплаты</span>
                  <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(l.payouts ?? 0)}</span>
                </div>
              </div>
            </Card>
          )
        })}
      </GridCols>

      {/* Распределение клиентов */}
      <Card>
        <SectionTitle title="Распределение клиентов по кураторам" />
        {distribution.length ? <Donut data={distribution} size={180} centerValue={String(k.active_clients ?? 0)} centerLabel="клиентов" showAmounts={false} />
          : <EmptyState text="Нет активных клиентов с куратором." />}
      </Card>

      {/* Воронка стадий + скорость — Этап 2/3 */}
      <GridCols cols="1fr 1fr" style={{ alignItems: 'start' }}>
        <Card>
          <SectionTitle title="Клиенты по стадиям кураторской работы" subtitle="цвет — куратор" />
          {(data?.funnel ?? []).length ? <CuratorStageStack funnel={data.funnel} stages={data?.curator_stages ?? []} />
            : <EmptyState text="Нет активных клиентов на стадиях." />}
        </Card>
        <Card>
          <SectionTitle title="Скорость работы" subtitle="Среднее время прохождения стадии, дней" />
          <EmptyState text="Поэтапная скорость появится по мере заполнения client_stages." />
        </Card>
      </GridCols>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text3, marginBottom: 2 }}>
      <span>{label}</span><span style={{ fontWeight: 500, color: C.text }}>{value}</span>
    </div>
  )
}

// Gauge через conic-gradient (дуга загрузки от -90deg).
function Gauge({ pct: p, color, active, max }: { pct: number; color: string; active: number; max: number }) {
  const deg = Math.min(p, 100) / 100 * 360
  return (
    <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0, borderRadius: '50%',
      background: `conic-gradient(from -90deg, ${color} 0deg ${deg}deg, ${C.emptySeg} ${deg}deg 360deg)` }}>
      <div style={{ position: 'absolute', inset: 13, borderRadius: '50%', background: C.card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>{p}%</div>
        <div style={{ fontSize: 11, color: C.weak }}>{active}/{max}</div>
      </div>
    </div>
  )
}
