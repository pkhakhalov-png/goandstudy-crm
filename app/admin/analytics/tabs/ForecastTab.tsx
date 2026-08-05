'use client'

import { C } from '../lib/theme'
import { money } from '../lib/format'
import { monthFull } from '../lib/format'
import { Card, SectionTitle, EmptyState, GridCols } from '../components/ui'
import { ForecastChart } from '../components/charts'

const ARTICLE_RU: Record<string, string> = {
  curator: 'Выплаты кураторам', salesperson: 'Комиссии продажников', office: 'Офис и сервисы',
  marketing: 'Маркетинг', software: 'Софт', salary: 'Зарплаты', other: 'Прочее',
}

export function ForecastTab({ data }: { data: any }) {
  const m = data?.month ?? {}
  const projected = Number(m.projected ?? 0)
  const plan = Number(m.plan ?? 0)
  const diff = projected - plan
  const ahead = diff >= 0
  const monthPct = plan > 0 ? Math.min(Math.round(projected / plan * 100), 100) : 0

  const guaranteed = data?.guaranteed ?? []
  const pipeline = Number(data?.pipeline_weighted ?? 0)
  const futureExp = data?.future_expenses ?? []
  const guaranteedSum = guaranteed.reduce((s: number, g: any) => s + Number(g.amount), 0)
  const expSum = futureExp.reduce((s: number, e: any) => s + Number(e.total), 0)
  const profitForecast = guaranteedSum + pipeline - expSum

  return (
    <GridCols cols="1.5fr 1fr" style={{ alignItems: 'start' }}>
      <Card>
        <SectionTitle title="Прогноз поступлений на 3 месяца" subtitle="Гарантировано — графики рассрочек, вероятно — воронка с учётом конверсии" />
        {guaranteed.length ? <ForecastChart guaranteed={guaranteed} pipeline={pipeline} />
          : <EmptyState text="Нет будущих плановых поступлений." />}
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {guaranteed.map((g: any) => (
            <div key={g.ym} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderTop: `1px solid ${C.divider}` }}>
              <span style={{ color: C.text2 }}>{monthFull(g.ym)}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>гарантировано <b>{money(g.amount)}</b></span>
            </div>
          ))}
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Взвешенный пайплайн (вероятно): {money(pipeline)}</div>
        </div>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', color: C.muted }}>Прогноз месяца · {m.ym ? monthFull(m.ym) : ''}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '8px 0 10px' }}>
            <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: '-.035em', color: C.text, fontVariantNumeric: 'tabular-nums' }}>{money(projected)}</div>
            <div style={{ fontSize: 14, color: C.text3 }}>план {money(plan)}</div>
          </div>
          <div style={{ height: 8, background: C.track, borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ height: '100%', width: `${monthPct}%`, background: C.good, borderRadius: 4 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: ahead ? C.goodBg : C.dangerBg, borderRadius: 10, padding: '11px 14px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: ahead ? C.good : C.danger }} />
            <span style={{ fontSize: 14, fontWeight: 500, color: ahead ? C.good : C.danger }}>
              {ahead ? `Идём с опережением на ${money(diff)}` : `Отстаём на ${money(-diff)}`}
            </span>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Будущие расходы и прибыль" />
          {futureExp.length ? futureExp.map((e: any, i: number) => (
            <div key={e.article} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '9px 0', borderTop: i ? `1px solid ${C.divider}` : 'none' }}>
              <span style={{ color: C.text2 }}>{ARTICLE_RU[e.article] || e.article}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(e.total)}</span>
            </div>
          )) : <div style={{ fontSize: 13, color: C.muted }}>Плановых расходов нет.</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: `1px solid ${C.grid}`, paddingTop: 12, marginTop: 8 }}>
            <span style={{ fontSize: 13, color: C.muted }}>Прогнозная прибыль</span>
            <span style={{ fontSize: 22, fontWeight: 600, color: profitForecast >= 0 ? C.good : C.danger, fontVariantNumeric: 'tabular-nums' }}>{money(profitForecast)}</span>
          </div>
        </Card>
      </div>
    </GridCols>
  )
}
