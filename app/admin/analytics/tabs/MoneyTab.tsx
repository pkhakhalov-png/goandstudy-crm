'use client'

import { C } from '../lib/theme'
import { money, short, pct } from '../lib/format'
import { Card, Kpi, SectionTitle, EmptyState, GridCols } from '../components/ui'
import { Donut } from '../components/Donut'
import { MoneyMonthlyChart } from '../components/charts'
import type { Period } from '../lib/period'

const ARTICLE_RU: Record<string, string> = {
  curator: 'Кураторы', salesperson: 'Продажники', office: 'Офис',
  marketing: 'Маркетинг', software: 'Софт', salary: 'Зарплаты', other: 'Прочее',
}
const SOURCE_RU: Record<string, string> = { installment: 'Рассрочки', invoice: 'Счета T-Bank' }

export function MoneyTab({ data, period }: { data: any; period: Period }) {
  const k = data?.kpis ?? {}
  const planPct = k.plan > 0 ? Math.round(k.came / k.plan * 100) : 0
  const margin = k.came > 0 ? (k.profit / k.came * 100) : 0

  const breakdown = (data?.expense_breakdown ?? []).map((r: any) => ({ name: ARTICLE_RU[r.article] || r.article, value: Number(r.total) }))
  const sources = (data?.sources ?? []).map((r: any) => ({ name: SOURCE_RU[r.source] || r.source, value: Number(r.total), color: r.source === 'installment' ? C.good : C.warn }))
  const debtors = data?.debtors ?? []
  const refunds = data?.refunds ?? []
  const refundsTotal = Number(data?.refunds_total ?? 0)
  const refundShare = k.came > 0 ? (refundsTotal / k.came * 100) : 0

  return (
    <>
      {/* KPI */}
      <GridCols cols="repeat(4, minmax(0,1fr))">
        <Kpi label="Пришло за период" value={money(k.came ?? 0)} valueColor={C.good} />
        <Kpi label="План на период" value={money(k.plan ?? 0)} valueColor={C.text2}
          progress={planPct} progressColor={C.warn}
          hint={`${planPct}% плана · осталось ${money(Math.max((k.plan ?? 0) - (k.came ?? 0), 0))}`} hintColor={C.text3} />
        <Kpi label="Дебиторка" value={money(k.receivables ?? 0)}
          hint={<span style={{ color: C.danger, fontWeight: 500 }}>из них просрочка {money(k.overdue ?? 0)}</span>} />
        <Kpi label="Прибыль" value={money(k.profit ?? 0)} valueColor={(k.profit ?? 0) >= 0 ? C.good : C.danger}
          hint={`маржа ${pct(margin, 1)} · расходы ${money(k.expenses ?? 0)}`} />
      </GridCols>

      {/* Поступления по месяцам */}
      <Card>
        <SectionTitle title="Поступления по месяцам" subtitle="План против факта, линия — расходы"
          right={<span style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <Legend color={C.neutral} label="План" />
            <Legend color={C.good} label="Факт" />
            <Legend color={C.danger} label="Расходы" line />
          </span>} />
        {(data?.monthly ?? []).length ? <MoneyMonthlyChart data={data.monthly} />
          : <EmptyState text="Нет данных по месяцам." />}
      </Card>

      {/* Два доната */}
      <GridCols cols="1fr 1fr">
        <Card>
          <SectionTitle title="Структура расходов" />
          {breakdown.length ? <Donut data={breakdown} centerValue={short(k.expenses ?? 0)} centerLabel="всего" />
            : <EmptyState text="За период нет оплаченных расходов." />}
        </Card>
        <Card>
          <SectionTitle title="Источники денег" />
          {sources.length ? <Donut data={sources} centerValue={short(k.came ?? 0)} centerLabel="поступило" />
            : <EmptyState text="За период поступлений нет." />}
        </Card>
      </GridCols>

      {/* Должники + возвраты */}
      <GridCols cols="1.55fr 1fr" style={{ alignItems: 'start' }}>
        <Card>
          <SectionTitle title="Должники" right={`${debtors.length} клиентов · ${money(k.receivables ?? 0)}`} />
          {debtors.length ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr .9fr auto', gap: 12, padding: '0 4px 10px', borderBottom: `1px solid ${C.grid}`, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: C.weak }}>
                <div>Клиент</div><div style={{ textAlign: 'right' }}>Долг</div><div style={{ textAlign: 'center' }}>Просрочка</div><div />
              </div>
              {debtors.map((d: any) => (
                <div key={d.client_id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr .9fr auto', gap: 12, alignItems: 'center', padding: '13px 4px', borderBottom: `1px solid ${C.divider}` }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{d.name}</div>
                    <div style={{ fontSize: 12, color: C.weak }}>{d.service_type === 'session' ? 'Сессии' : 'Полное сопровождение'} · {d.country || '—'}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(d.debt)}</div>
                  <div style={{ textAlign: 'center' }}><OverdueBadge days={d.overdue_days} /></div>
                  <a href={`/admin/clients/${d.client_id}`} style={{ fontSize: 13, fontWeight: 500, padding: '6px 12px', border: `1px solid ${C.ctrlBorder2}`, borderRadius: 8, color: C.good, textDecoration: 'none', whiteSpace: 'nowrap' }}>К клиенту</a>
                </div>
              ))}
            </div>
          ) : <EmptyState text="Должников нет." />}
        </Card>

        <Card>
          <SectionTitle title="Возвраты" />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontSize: 32, fontWeight: 600, color: C.danger, fontVariantNumeric: 'tabular-nums' }}>{money(refundsTotal)}</div>
            <div style={{ fontSize: 13, color: C.text3 }}>{pct(refundShare, 1)} от выручки</div>
          </div>
          <div style={{ height: 6, background: '#f0eeeb', borderRadius: 3, overflow: 'hidden', margin: '10px 0 14px' }}>
            <div style={{ height: '100%', width: `${Math.min(refundShare / 10 * 100, 100)}%`, background: C.danger }} />
          </div>
          {refunds.length ? refunds.map((r: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderTop: i ? `1px solid ${C.divider}` : 'none' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{r.name}</div>
                <div style={{ fontSize: 12, color: C.weak }}>{r.reason || 'Возврат'}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{money(r.amount)}</div>
            </div>
          )) : <div style={{ fontSize: 13, color: C.muted }}>За период возвратов нет.</div>}
        </Card>
      </GridCols>
    </>
  )
}

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.text2 }}>
      <span style={{ width: line ? 14 : 10, height: line ? 2 : 10, borderRadius: line ? 0 : 3, background: color }} />
      {label}
    </span>
  )
}

function OverdueBadge({ days }: { days: number }) {
  let bg: string = C.chipBg, color: string = C.text3, text = 'в срок'
  if (days > 30) { bg = C.dangerBg; color = C.danger; text = `${days} дн.` }
  else if (days >= 1) { bg = C.warnBg; color = C.warnText; text = `${days} дн.` }
  return <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: bg, color }}>{text}</span>
}
