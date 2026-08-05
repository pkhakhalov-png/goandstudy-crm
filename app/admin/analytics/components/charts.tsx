'use client'

import {
  ComposedChart, BarChart, LineChart, Bar, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { C, SERIES, factColor } from '../lib/theme'
import { short, money, monthShort } from '../lib/format'

const axisTick = { fontSize: 11, fill: C.weak2 }
const tooltipStyle = { fontSize: 13, borderRadius: 10, border: `1px solid ${C.border}` }

// ── Деньги: план (bar) / факт (bar) / расходы (line) по месяцам ──
export function MoneyMonthlyChart({ data }: { data: any[] }) {
  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="ym" tickFormatter={monthShort} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={short} tick={axisTick} axisLine={false} tickLine={false} width={64} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [money(Number(v)), ({ plan: 'План', fact: 'Факт', expenses: 'Расходы' } as any)[n] || n]} labelFormatter={(l: any) => monthShort(String(l))} />
          <Bar dataKey="plan" fill={C.neutral} radius={[5, 5, 0, 0]} barSize={16} />
          <Bar dataKey="fact" radius={[5, 5, 0, 0]} barSize={16}>
            {data.map((d, i) => <Cell key={i} fill={factColor(Number(d.fact), Number(d.plan))} />)}
          </Bar>
          <Line dataKey="expenses" stroke={C.danger} strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Кураторы: стек клиентов по стадиям, цвет — куратор (топ-5 + Остальные) ──
export function CuratorStageStack({ funnel, stages }: { funnel: any[]; stages: { code: string; title: string; position: number }[] }) {
  const codeTitle = new Map(stages.map(s => [s.code, s.title]))
  const codePos = new Map(stages.map(s => [s.code, s.position]))
  const title = (code: string) => code === '(не начато)' ? 'Назначение' : (codeTitle.get(code) || code)
  const pos = (code: string) => code === '(не начато)' ? 0 : (codePos.get(code) ?? 99)

  // топ-5 кураторов по числу клиентов
  const totals = new Map<string, number>()
  for (const r of funnel) totals.set(r.curator, (totals.get(r.curator) || 0) + Number(r.cnt))
  const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0])
  const nameOf = (c: string) => top.includes(c) ? c : 'Остальные'
  const series = [...top, ...(totals.size > 5 ? ['Остальные'] : [])]

  // пивот: стадия → { stage, [curator]: cnt }
  const byStage = new Map<string, any>()
  for (const r of funnel) {
    const st = title(r.stage)
    if (!byStage.has(st)) byStage.set(st, { stage: st, _pos: pos(r.stage) })
    const row = byStage.get(st)
    const key = nameOf(r.curator)
    row[key] = (row[key] || 0) + Number(r.cnt)
  }
  const rows = [...byStage.values()].sort((a, b) => a._pos - b._pos)

  return (
    <div style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="stage" tick={{ fontSize: 10, fill: C.weak }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={50} />
          <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={28} />
          <Tooltip contentStyle={tooltipStyle} />
          {series.map((s, i) => (
            <Bar key={s} dataKey={s} stackId="a" fill={SERIES[i % SERIES.length]} radius={i === series.length - 1 ? [3, 3, 0, 0] : undefined as any} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Продажники: динамика сборов, топ-4 линии ──
export function SalesDynamicsChart({ dynamics }: { dynamics: any[] }) {
  const withTotals = dynamics.map(d => ({ ...d, total: (d.series || []).reduce((s: number, x: any) => s + Number(x.v), 0) }))
  const top = withTotals.filter(d => d.total > 0).sort((a, b) => b.total - a.total).slice(0, 4)
  const monthsSet = new Set<string>()
  for (const d of top) for (const p of d.series || []) monthsSet.add(p.ym)
  const months = [...monthsSet].sort()
  const rows = months.map(ym => {
    const row: any = { ym }
    for (const d of top) row[d.name] = Number((d.series || []).find((p: any) => p.ym === ym)?.v || 0)
    return row
  })
  if (!top.length) return null
  return (
    <div style={{ width: '100%', height: 250 }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="ym" tickFormatter={monthShort} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={short} tick={axisTick} axisLine={false} tickLine={false} width={56} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => money(Number(v))} labelFormatter={(l: any) => monthShort(String(l))} />
          {top.map((d, i) => <Line key={d.name} dataKey={d.name} stroke={SERIES[i % SERIES.length]} strokeWidth={2} dot={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Прогноз: стек гарантировано + вероятно по 3 месяцам ──
export function ForecastChart({ guaranteed, pipeline }: { guaranteed: any[]; pipeline: number }) {
  const probablePer = guaranteed.length ? pipeline / guaranteed.length : 0
  const rows = guaranteed.map(g => ({ ym: g.ym, guaranteed: Number(g.amount), probable: probablePer }))
  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="ym" tickFormatter={monthShort} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={short} tick={axisTick} axisLine={false} tickLine={false} width={64} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [money(Number(v)), n === 'guaranteed' ? 'Гарантировано' : 'Вероятно']} labelFormatter={(l: any) => monthShort(String(l))} />
          <Bar dataKey="guaranteed" stackId="a" fill={C.good} barSize={54} />
          <Bar dataKey="probable" stackId="a" fill={C.good3} radius={[6, 6, 0, 0]} barSize={54} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
