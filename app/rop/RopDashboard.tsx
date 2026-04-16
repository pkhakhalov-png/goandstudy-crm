'use client'

import { useState, useTransition } from 'react'
import { upsertSalesPlan } from './actions'

interface Props {
  salespersons: any[]
  salesPlans: any[]
  clients: any[]
  payments: any[]
  deals: any[]
  stages: any[]
  messages: any[]
  tasks: any[]
  settings: any[]
  currentMonth: string
}

const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

function getSetting(settings: any[], key: string, fallback: any = null) {
  const s = settings.find(s => s.key === key)
  return s ? (typeof s.value === 'string' ? JSON.parse(s.value) : s.value) : fallback
}

function fmt(n: number) { return Math.round(n).toLocaleString('ru') }

export function RopDashboard({ salespersons, salesPlans, clients, payments, deals, stages, messages, tasks, settings, currentMonth }: Props) {
  const [month, setMonth] = useState(currentMonth)
  const [editPlanId, setEditPlanId] = useState<string | null>(null)
  const [planDraft, setPlanDraft] = useState('')
  const [, startTransition] = useTransition()

  const [y, m] = month.split('-').map(Number)
  const monthLabel = `${MONTHS_RU[m - 1]} ${y}`

  function shiftMonth(dir: number) {
    let nm = m + dir, ny = y
    if (nm < 1) { nm = 12; ny-- }
    if (nm > 12) { nm = 1; ny++ }
    setMonth(`${ny}-${String(nm).padStart(2, '0')}`)
  }

  // ═══ Sales fact per salesperson ═══
  const clientBySp: Record<string, number[]> = {}
  clients.forEach(c => {
    if (c.salesperson_id) {
      if (!clientBySp[c.salesperson_id]) clientBySp[c.salesperson_id] = []
      clientBySp[c.salesperson_id].push(c.id)
    }
  })

  function getFactForSp(spId: string): number {
    const cIds = clientBySp[spId] || []
    return payments
      .filter(p => p.is_paid && cIds.includes(p.client_id) && (p.fact_date || p.plan_date || '').startsWith(month))
      .reduce((s: number, p: any) => s + Number(p.fact_sum ?? p.plan_sum), 0)
  }

  const totalFact = salespersons.reduce((s, sp) => s + getFactForSp(sp.id), 0)
  // DEBUG: remove after confirming data flow
  const debugClients = clients.length
  const debugPayments = payments.filter((p: any) => p.is_paid).length
  const debugSp = salespersons.length
  const deptPlan = salesPlans.find((p: any) => !p.salesperson_id)
  const deptPlanAmt = deptPlan ? Number(deptPlan.plan_amount) : 0

  // ═══ Pipeline weighted value ═══
  const stageMap = Object.fromEntries(stages.map((s: any) => [s.id, s]))
  const activeDeals = deals.filter((d: any) => {
    const st = stageMap[d.stage_id]
    return st && st.stage_type === 'active'
  })
  const weightedPipeline = activeDeals.reduce((s: number, d: any) => {
    const st = stageMap[d.stage_id]
    return s + Number(d.budget || 0) * Number(st?.weight || 0)
  }, 0)

  // ═══ Forecast ═══
  const forecast = totalFact + weightedPipeline
  const forecastPct = deptPlanAmt > 0 ? Math.round(forecast / deptPlanAmt * 100) : 0
  const forecastGap = deptPlanAmt - forecast

  // ═══ Score per salesperson ═══
  const scoreWeights = getSetting(settings, 'score_weights', { sales: 0.4, conv: 0.25, sla: 0.2, tasks: 0.15 })
  const slaMinutes = getSetting(settings, 'sla_response_minutes', 30)

  function calcScore(spId: string) {
    const plan = salesPlans.find((p: any) => p.salesperson_id === spId)
    const planAmt = plan ? Number(plan.plan_amount) : 0
    const fact = getFactForSp(spId)
    const salesPct = planAmt > 0 ? Math.min(fact / planAmt, 1.5) : 0

    const spDeals = deals.filter((d: any) => d.salesperson_id === spId)
    const spSuccess = spDeals.filter((d: any) => stageMap[d.stage_id]?.stage_type === 'success')
    const convPct = spDeals.length > 0 ? spSuccess.length / spDeals.length : 0

    // Avg response time
    const spDealIds = new Set(spDeals.map((d: any) => d.id))
    const spMessages = messages.filter((m: any) => spDealIds.has(m.deal_id))
    const msgByDeal: Record<string, any[]> = {}
    spMessages.forEach((m: any) => {
      if (!msgByDeal[m.deal_id]) msgByDeal[m.deal_id] = []
      msgByDeal[m.deal_id].push(m)
    })

    let totalResponse = 0, responseCount = 0
    Object.values(msgByDeal).forEach(msgs => {
      const sorted = [...msgs].sort((a, b) => a.created_at.localeCompare(b.created_at))
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].direction === 'incoming' && sorted[i + 1].direction === 'outgoing') {
          const delta = (new Date(sorted[i + 1].created_at).getTime() - new Date(sorted[i].created_at).getTime()) / 60000
          totalResponse += delta
          responseCount++
        }
      }
    })
    const avgResponse = responseCount > 0 ? totalResponse / responseCount : slaMinutes
    const slaScore = Math.max(0, 1 - avgResponse / (slaMinutes * 2))

    const spTasks = tasks.filter((t: any) => {
      const deal = deals.find((d: any) => d.id === t.deal_id)
      return deal && deal.salesperson_id === spId
    })
    const doneTasks = spTasks.filter((t: any) => t.is_done)
    const taskPct = spTasks.length > 0 ? doneTasks.length / spTasks.length : 1

    const score = (salesPct * scoreWeights.sales + convPct * scoreWeights.conv + slaScore * scoreWeights.sla + taskPct * scoreWeights.tasks) * 100
    return { score: Math.round(Math.min(score, 100)), salesPct, convPct, avgResponse: Math.round(avgResponse), fact, planAmt }
  }

  const leaderboard = salespersons
    .filter(sp => sp.is_active)
    .map(sp => ({ ...sp, ...calcScore(sp.id) }))
    .sort((a, b) => b.score - a.score)

  // ═══ Critical panel ═══
  const stuckDays = getSetting(settings, 'stuck_deal_days', 5)
  const nowMs = Date.now()

  const criticalItems: { type: string; priority: number; color: string; label: string; sublabel: string; dealId?: string; spId?: string }[] = []

  // Unreplied deals
  const dealLastIncoming: Record<string, string> = {}
  messages.forEach((m: any) => {
    if (m.direction === 'incoming' && !dealLastIncoming[m.deal_id]) dealLastIncoming[m.deal_id] = m.created_at
  })
  const dealLastOutgoing: Record<string, string> = {}
  messages.forEach((m: any) => {
    if (m.direction === 'outgoing' && !dealLastOutgoing[m.deal_id]) dealLastOutgoing[m.deal_id] = m.created_at
  })

  deals.forEach((d: any) => {
    const lastIn = dealLastIncoming[d.id]
    const lastOut = dealLastOutgoing[d.id]
    if (!lastIn) return
    if (lastOut && lastOut > lastIn) return
    const waitMin = (nowMs - new Date(lastIn).getTime()) / 60000
    if (waitMin > slaMinutes * 2) {
      criticalItems.push({ type: 'no_reply', priority: 1, color: 'var(--red)', label: `Без ответа ${Math.round(waitMin / 60)}ч`, sublabel: d.title, dealId: d.id })
    } else if (waitMin > slaMinutes) {
      criticalItems.push({ type: 'no_reply', priority: 3, color: 'var(--gold)', label: `Без ответа ${Math.round(waitMin)}мин`, sublabel: d.title, dealId: d.id })
    }
  })

  // Critical deals
  deals.filter((d: any) => d.is_critical).forEach((d: any) => {
    criticalItems.push({ type: 'critical', priority: 2, color: 'var(--red)', label: 'Критичная сделка', sublabel: d.title, dealId: d.id })
  })

  // Stuck deals
  activeDeals.forEach((d: any) => {
    const daysSince = (nowMs - new Date(d.updated_at).getTime()) / 86400000
    if (daysSince > stuckDays) {
      criticalItems.push({ type: 'stuck', priority: 4, color: 'var(--gold)', label: `Без движения ${Math.round(daysSince)}д`, sublabel: d.title, dealId: d.id })
    }
  })

  // Overdue tasks
  tasks.filter((t: any) => !t.is_done && t.deadline && new Date(t.deadline) < new Date()).forEach((t: any) => {
    criticalItems.push({ type: 'task', priority: 5, color: 'var(--gold)', label: `Задача просрочена`, sublabel: t.title, dealId: t.deal_id })
  })

  criticalItems.sort((a, b) => a.priority - b.priority)

  // ═══ Recommendations ═══
  const recommendations: { text: string; actionLabel?: string }[] = []

  leaderboard.forEach(sp => {
    if (sp.convPct < 0.3 && deals.filter((d: any) => d.salesperson_id === sp.id).length > 5) {
      recommendations.push({ text: `Перераспределить сделки от ${sp.name} (конверсия ${Math.round(sp.convPct * 100)}%)`, actionLabel: 'Посмотреть сделки' })
    }
  })

  if (criticalItems.filter(i => i.type === 'no_reply').length > 3) {
    recommendations.push({ text: `${criticalItems.filter(i => i.type === 'no_reply').length} сделок без ответа — проверить менеджеров` })
  }

  leaderboard.forEach(sp => {
    const overdue = tasks.filter((t: any) => !t.is_done && t.deadline && new Date(t.deadline) < new Date() && deals.find((d: any) => d.id === t.deal_id && d.salesperson_id === sp.id))
    if (overdue.length >= 5) {
      recommendations.push({ text: `Провести 1-on-1 с ${sp.name} (${overdue.length} просроченных задач)` })
    }
  })

  // ═══ Plan editing ═══
  function handleSavePlan(spId: string | null) {
    const v = Number(planDraft)
    if (!(v >= 0)) return
    startTransition(async () => {
      await upsertSalesPlan(month, spId, v)
      setEditPlanId(null)
    })
  }

  const cardStyle: React.CSSProperties = { background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 14, padding: '16px 20px', marginBottom: 16 }
  const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12 }

  function progressBar(value: number, max: number, color: string) {
    const pct = max > 0 ? Math.min(Math.round(value / max * 100), 100) : 0
    return (
      <div style={{ height: 6, background: 'var(--bor)', borderRadius: 3, flex: 1 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width .3s' }} />
      </div>
    )
  }

  function pctColor(pct: number) {
    if (pct >= 80) return 'var(--green)'
    if (pct >= 50) return 'var(--gold)'
    return 'var(--red)'
  }

  return (
    <>
      {/* Month picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => shiftMonth(-1)} className="btn-s" style={{ padding: '4px 10px' }}>←</button>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{monthLabel}</span>
        <button onClick={() => shiftMonth(1)} className="btn-s" style={{ padding: '4px 10px' }}>→</button>
      </div>

      {/* DEBUG */}
      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8 }}>
        v2 | clients: {debugClients} | paid: {debugPayments} | sp: {debugSp} | fact: {totalFact}
      </div>

      {/* ═══ CRITICAL PANEL ═══ */}
      {criticalItems.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionTitle}>Критично ({criticalItems.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
            {criticalItems.slice(0, 10).map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: `${item.color}11`, border: `1px solid ${item.color}33` }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sublabel}</div>
                  <div style={{ fontSize: 10, color: item.color }}>{item.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ TOP CARDS: Forecast + Dept Sales ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Факт</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)', marginTop: 4 }}>{fmt(totalFact)} ₽</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            План отдела
            {!editPlanId || editPlanId !== '__dept__' ? (
              <span onClick={() => { setEditPlanId('__dept__'); setPlanDraft(String(deptPlanAmt)) }} style={{ marginLeft: 6, cursor: 'pointer', color: 'var(--purple)' }}>✎</span>
            ) : null}
          </div>
          {editPlanId === '__dept__' ? (
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <input type="number" value={planDraft} onChange={e => setPlanDraft(e.target.value)} autoFocus style={{ width: 100, fontSize: 14, padding: '2px 6px', border: '1px solid var(--purple)', borderRadius: 6 }} />
              <button onClick={() => handleSavePlan(null)} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, border: 'none', background: 'var(--purple)', color: '#fff', cursor: 'pointer' }}>✓</button>
              <button onClick={() => setEditPlanId(null)} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, border: '1px solid var(--bor2)', background: 'var(--surf)', cursor: 'pointer' }}>×</button>
            </div>
          ) : (
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{fmt(deptPlanAmt)} ₽</div>
          )}
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Прогноз</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: pctColor(forecastPct), marginTop: 4 }}>{fmt(forecast)} ₽</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {progressBar(forecast, deptPlanAmt, pctColor(forecastPct))}
            <span style={{ fontSize: 11, fontWeight: 700, color: pctColor(forecastPct) }}>{forecastPct}%</span>
          </div>
          {forecastGap > 0 && <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 4 }}>Гэп: {fmt(forecastGap)} ₽</div>}
        </div>
      </div>

      {/* ═══ LEADERBOARD ═══ */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Лидерборд менеджеров</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>
              <th style={{ padding: '6px 8px' }}>#</th>
              <th style={{ padding: '6px 8px' }}>Менеджер</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Факт</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>План</th>
              <th style={{ padding: '6px 8px', width: 120 }}>Прогресс</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((sp, idx) => {
              const pct = sp.planAmt > 0 ? Math.round(sp.fact / sp.planAmt * 100) : 0
              return (
                <tr key={sp.id} style={{ borderTop: '1px solid var(--bor2)' }}>
                  <td style={{ padding: '10px 8px', fontWeight: 700, color: idx === 0 ? 'var(--gold)' : 'var(--muted)' }}>
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                  </td>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{sp.name}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>{fmt(sp.fact)} ₽</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--muted)' }}>
                    {editPlanId === sp.id ? (
                      <span style={{ display: 'inline-flex', gap: 4 }}>
                        <input type="number" value={planDraft} onChange={e => setPlanDraft(e.target.value)} autoFocus style={{ width: 80, fontSize: 11, padding: '2px 4px', border: '1px solid var(--purple)', borderRadius: 4, textAlign: 'right' }} />
                        <button onClick={() => handleSavePlan(sp.id)} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: 'none', background: 'var(--purple)', color: '#fff', cursor: 'pointer' }}>✓</button>
                        <button onClick={() => setEditPlanId(null)} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--bor2)', background: 'var(--surf)', cursor: 'pointer' }}>×</button>
                      </span>
                    ) : (
                      <span onClick={() => { setEditPlanId(sp.id); setPlanDraft(String(sp.planAmt)) }} style={{ cursor: 'pointer' }}>
                        {fmt(sp.planAmt)} ₽ <span style={{ color: 'var(--purple)', fontSize: 10 }}>✎</span>
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {progressBar(sp.fact, sp.planAmt, pctColor(pct))}
                      <span style={{ fontSize: 10, fontWeight: 700, color: pctColor(pct), minWidth: 30 }}>{pct}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                    <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: pctColor(sp.score) + '18', color: pctColor(sp.score) }}>
                      {sp.score}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ═══ RECOMMENDATIONS ═══ */}
      {recommendations.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionTitle}>Рекомендации</div>
          {recommendations.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(177,94,204,.06)', border: '1px solid rgba(177,94,204,.15)', marginBottom: 6 }}>
              <div style={{ fontSize: 16 }}>💡</div>
              <div style={{ flex: 1, fontSize: 12, color: 'var(--text)' }}>{r.text}</div>
              {r.actionLabel && <button className="btn-s" style={{ fontSize: 10, padding: '4px 10px' }}>{r.actionLabel}</button>}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
