'use client'

import { useState } from 'react'

interface Payment {
  id: number
  client_id: number
  num: number
  plan_date: string
  plan_sum: number
  fact_sum: number | null
  fact_date: string | null
  is_paid: boolean
  status: string
  comment: string | null
  client_name: string
  client_country: string
  client_status: string
  salesperson_id: string | null
  salesperson_name: string
  curator_name: string
}

interface Props {
  payments: Payment[]
  salespersons: { id: string; name: string }[]
}

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const statusColor: Record<string, string> = {
  paid: 'var(--green)',
  overdue: 'var(--red)',
  soon: 'var(--gold)',
  pending: 'var(--muted)',
}

const statusBg: Record<string, string> = {
  paid: 'rgba(52,199,89,.1)',
  overdue: 'rgba(255,59,48,.12)',
  soon: 'rgba(255,149,0,.1)',
  pending: 'rgba(134,134,139,.06)',
}

const statusLabel: Record<string, string> = {
  paid: 'Оплачен',
  overdue: 'Просрочен',
  soon: 'Скоро',
  pending: 'Ожидается',
}

export function CalendarClient({ payments, salespersons }: Props) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())
  const [filterSalesperson, setFilterSalesperson] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [hidePaid, setHidePaid] = useState(false)
  const [categoryView, setCategoryView] = useState<null | 'plan' | 'paid' | 'overdue' | 'soon'>(null)

  function shiftMonth(dir: number) {
    let m = month + dir, y = year
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setMonth(m); setYear(y); setSelectedDay(null)
  }

  // Filter payments
  const filtered = payments.filter(p => {
    if (filterSalesperson && p.salesperson_id !== filterSalesperson) return false
    if (filterStatus && p.status !== filterStatus) return false
    if (hidePaid && p.is_paid) return false
    if (p.client_status === 'completed') return false
    return true
  })

  // Group by date
  const byDate = new Map<string, Payment[]>()
  filtered.forEach(p => {
    const d = p.plan_date
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d)!.push(p)
  })

  // Calendar grid
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDow = (firstDay.getDay() + 6) % 7 // Monday=0
  const daysInMonth = lastDay.getDate()

  const weeks: (number | null)[][] = []
  let week: (number | null)[] = Array(startDow).fill(null)
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d)
    if (week.length === 7) { weeks.push(week); week = [] }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }

  const todayStr = now.toISOString().split('T')[0]
  const selectedDateStr = selectedDay
  const selectedPayments = selectedDay ? (byDate.get(selectedDay) ?? []) : []

  // Month stats
  const monthPayments = filtered.filter(p => {
    const d = new Date(p.plan_date)
    return d.getMonth() === month && d.getFullYear() === year
  })
  const monthTotal = monthPayments.reduce((s, p) => s + Number(p.plan_sum), 0)
  const monthPaid = monthPayments.filter(p => p.is_paid).reduce((s, p) => s + Number(p.fact_sum || p.plan_sum), 0)
  const monthOverdue = monthPayments.filter(p => p.status === 'overdue').reduce((s, p) => s + Number(p.plan_sum), 0)
  const monthSoon = monthPayments.filter(p => p.status === 'soon').reduce((s, p) => s + Number(p.plan_sum), 0)

  return (
    <>
      {/* Stats */}
      <div className="kw">
        <div className="kg k4">
          <div className="kc" onClick={() => setCategoryView('plan')} style={{ cursor: 'pointer' }}>
            <div className="kl">План на месяц</div>
            <div className="kv" style={{ fontSize: 17 }}>{monthTotal.toLocaleString('ru')} ₽</div>
            <div className="ks">{monthPayments.length} платежей</div>
          </div>
          <div className="kc" onClick={() => setCategoryView('paid')} style={{ cursor: 'pointer' }}>
            <div className="kl">Оплачено</div>
            <div className="kv g" style={{ fontSize: 17 }}>{monthPaid.toLocaleString('ru')} ₽</div>
            <div className="ks">{monthPayments.filter(p => p.is_paid).length} платежей</div>
          </div>
          <div className="kc" onClick={() => setCategoryView('overdue')} style={{ cursor: 'pointer' }}>
            <div className="kl">Просрочено</div>
            <div className="kv r" style={{ fontSize: 17 }}>{monthOverdue.toLocaleString('ru')} ₽</div>
            <div className="ks">{monthPayments.filter(p => p.status === 'overdue').length} платежей</div>
          </div>
          <div className="kc" onClick={() => setCategoryView('soon')} style={{ cursor: 'pointer' }}>
            <div className="kl">Скоро (7 дней)</div>
            <div className="kv o" style={{ fontSize: 17 }}>{monthSoon.toLocaleString('ru')} ₽</div>
            <div className="ks">{monthPayments.filter(p => p.status === 'soon').length} платежей</div>
          </div>
        </div>
      </div>

      {categoryView && (
        <CategoryModal
          category={categoryView}
          monthLabel={`${MONTHS[month]} ${year}`}
          payments={
            categoryView === 'plan' ? monthPayments
              : categoryView === 'paid' ? monthPayments.filter(p => p.is_paid)
              : categoryView === 'overdue' ? monthPayments.filter(p => p.status === 'overdue')
              : monthPayments.filter(p => p.status === 'soon')
          }
          onClose={() => setCategoryView(null)}
        />
      )}

      <div style={{ padding: '0 28px 28px' }}>
        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <button onClick={() => shiftMonth(-1)} style={{ width: 32, height: 32, border: '1px solid var(--bor2)', borderRadius: 8, background: 'var(--surf)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14"><polyline points="10,4 6,8 10,12" /></svg>
          </button>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', minWidth: 160, textAlign: 'center' }}>
            {MONTHS[month]} {year}
          </div>
          <button onClick={() => shiftMonth(1)} style={{ width: 32, height: 32, border: '1px solid var(--bor2)', borderRadius: 8, background: 'var(--surf)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14"><polyline points="6,4 10,8 6,12" /></svg>
          </button>
          <button onClick={() => { setMonth(now.getMonth()); setYear(now.getFullYear()); setSelectedDay(null) }}
            className="btn-s" style={{ fontSize: 11, padding: '5px 12px' }}>Сегодня</button>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="si" value={filterSalesperson} onChange={e => setFilterSalesperson(e.target.value)}>
              <option value="">Все продажники</option>
              {salespersons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="si" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Все статусы</option>
              <option value="overdue">Просрочка</option>
              <option value="soon">Скоро</option>
              <option value="pending">Ожидается</option>
              <option value="paid">Оплачен</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={hidePaid} onChange={e => setHidePaid(e.target.checked)} />
              Скрыть оплаченные
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* Calendar grid */}
          <div style={{ flex: 1, background: 'var(--surf)', border: '1px solid var(--bor)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--sh)' }}>
            {/* Weekday headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--bor2)' }}>
              {WEEKDAYS.map(wd => (
                <div key={wd} style={{ padding: '10px 0', textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{wd}</div>
              ))}
            </div>

            {/* Weeks */}
            {weeks.map((w, wi) => (
              <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: wi < weeks.length - 1 ? '1px solid var(--bor2)' : 'none' }}>
                {w.map((day, di) => {
                  if (day === null) return <div key={di} style={{ minHeight: 90, background: 'var(--surf2)' }} />

                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const dayPayments = byDate.get(dateStr) ?? []
                  const isToday = dateStr === todayStr
                  const isSelected = dateStr === selectedDateStr
                  const isWeekend = di >= 5
                  const hasOverdue = dayPayments.some(p => p.status === 'overdue')
                  const hasSoon = dayPayments.some(p => p.status === 'soon')
                  const totalSum = dayPayments.filter(p => !p.is_paid).reduce((s, p) => s + Number(p.plan_sum), 0)

                  return (
                    <div key={di}
                      onClick={() => setSelectedDay(dateStr === selectedDay ? null : dateStr)}
                      style={{
                        minHeight: 90, padding: '6px 8px', cursor: 'pointer',
                        background: isSelected ? 'var(--pl)' : isToday ? 'rgba(177,94,204,.04)' : isWeekend ? 'rgba(0,0,0,.015)' : 'transparent',
                        borderLeft: isSelected ? '3px solid var(--purple)' : '3px solid transparent',
                        transition: 'background .15s',
                      }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{
                          fontSize: 12, fontWeight: isToday ? 800 : 600,
                          color: isToday ? '#fff' : 'var(--text)',
                          background: isToday ? 'var(--purple)' : 'transparent',
                          borderRadius: 6, padding: isToday ? '1px 6px' : 0,
                        }}>{day}</span>
                        {dayPayments.length > 0 && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: hasOverdue ? 'var(--red)' : hasSoon ? 'var(--gold)' : 'var(--muted)' }}>
                            {dayPayments.length}
                          </span>
                        )}
                      </div>

                      {/* Payment dots */}
                      {dayPayments.slice(0, 3).map(p => (
                        <div key={p.id} style={{
                          fontSize: 9, padding: '2px 5px', marginBottom: 2,
                          borderRadius: 4, background: statusBg[p.status],
                          color: statusColor[p.status], fontWeight: 600,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {p.client_name.split(' ')[0]} · {Number(p.plan_sum).toLocaleString('ru')}₽
                        </div>
                      ))}
                      {dayPayments.length > 3 && (
                        <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600, paddingLeft: 5 }}>
                          +{dayPayments.length - 3} ещё
                        </div>
                      )}
                      {totalSum > 0 && dayPayments.length > 0 && (
                        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--purple)', marginTop: 2, paddingLeft: 5 }}>
                          {(totalSum / 1000).toFixed(0)}к ₽
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Side panel — selected day details */}
          <div style={{ width: 320, minWidth: 320, background: 'var(--surf)', border: '1px solid var(--bor)', borderRadius: 16, boxShadow: 'var(--sh)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--bor2)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
                {selectedDay
                  ? new Date(selectedDay + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })
                  : 'Выберите день'}
              </div>
              {selectedPayments.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                  {selectedPayments.length} платежей · {selectedPayments.reduce((s, p) => s + Number(p.plan_sum), 0).toLocaleString('ru')} ₽
                </div>
              )}
            </div>

            <div style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto', padding: '10px 14px' }}>
              {!selectedDay && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                  Нажмите на день в календаре
                </div>
              )}

              {selectedPayments.length === 0 && selectedDay && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                  Нет платежей на этот день
                </div>
              )}

              {selectedPayments.map(p => (
                <div key={p.id} style={{
                  padding: '12px 14px', marginBottom: 8,
                  border: `1px solid ${p.status === 'overdue' ? 'rgba(255,59,48,.2)' : p.status === 'soon' ? 'rgba(255,149,0,.2)' : p.status === 'paid' ? 'rgba(52,199,89,.2)' : 'var(--bor2)'}`,
                  borderLeft: `3px solid ${statusColor[p.status]}`,
                  borderRadius: 10, background: statusBg[p.status],
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{p.client_name}</span>
                    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 12, background: statusBg[p.status], color: statusColor[p.status], fontWeight: 700, border: `1px solid ${statusColor[p.status]}22` }}>
                      {statusLabel[p.status]}
                    </span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: statusColor[p.status], marginBottom: 6 }}>
                    {Number(p.plan_sum).toLocaleString('ru')} ₽
                  </div>
                  {p.is_paid && p.fact_sum && (
                    <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600, marginBottom: 4 }}>
                      Оплачено: {Number(p.fact_sum).toLocaleString('ru')} ₽ {p.fact_date ? `(${new Date(p.fact_date).toLocaleDateString('ru-RU')})` : ''}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 10, color: 'var(--muted)' }}>
                    <span>Платёж #{p.num}</span>
                    {p.client_country && <span>· {p.client_country}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(52,199,89,.08)', border: '1px solid rgba(52,199,89,.15)', color: 'var(--green)', fontWeight: 600 }}>{p.salesperson_name}</span>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'var(--pl)', border: '1px solid var(--pb)', color: 'var(--purple)', fontWeight: 600 }}>{p.curator_name}</span>
                  </div>
                  {p.comment && (
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6, fontStyle: 'italic' }}>{p.comment}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

const CATEGORY_TITLE: Record<'plan' | 'paid' | 'overdue' | 'soon', string> = {
  plan: 'План на месяц',
  paid: 'Оплачено',
  overdue: 'Просрочено',
  soon: 'Скоро (7 дней)',
}

const CATEGORY_COLOR: Record<'plan' | 'paid' | 'overdue' | 'soon', string> = {
  plan: 'var(--text)',
  paid: 'var(--green)',
  overdue: 'var(--red)',
  soon: 'var(--gold)',
}

function CategoryModal({
  category, monthLabel, payments, onClose,
}: {
  category: 'plan' | 'paid' | 'overdue' | 'soon'
  monthLabel: string
  payments: Payment[]
  onClose: () => void
}) {
  const total = payments.reduce((s, p) => s + Number(category === 'paid' ? (p.fact_sum || p.plan_sum) : p.plan_sum), 0)
  const sorted = [...payments].sort((a, b) => a.plan_date.localeCompare(b.plan_date))

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surf)', borderRadius: 16, width: '100%', maxWidth: 720,
          maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.25)',
        }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--bor2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              {CATEGORY_TITLE[category]} · {monthLabel}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
              {sorted.length} платежей · <span style={{ color: CATEGORY_COLOR[category], fontWeight: 700 }}>{total.toLocaleString('ru')} ₽</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, border: '1px solid var(--bor2)', borderRadius: 8, background: 'var(--surf)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14"><line x1="3" y1="3" x2="13" y2="13" /><line x1="13" y1="3" x2="3" y2="13" /></svg>
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '14px 18px' }}>
          {sorted.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Нет платежей в этой категории
            </div>
          )}
          {sorted.map(p => (
            <div key={p.id} style={{
              display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: 12, alignItems: 'center',
              padding: '12px 14px', marginBottom: 8,
              border: `1px solid ${p.status === 'overdue' ? 'rgba(255,59,48,.2)' : p.status === 'soon' ? 'rgba(255,149,0,.2)' : p.status === 'paid' ? 'rgba(52,199,89,.2)' : 'var(--bor2)'}`,
              borderLeft: `3px solid ${statusColor[p.status]}`,
              borderRadius: 10, background: statusBg[p.status],
            }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                {new Date(p.plan_date + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>
                  {p.client_name} <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>· #{p.num}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(52,199,89,.08)', border: '1px solid rgba(52,199,89,.15)', color: 'var(--green)', fontWeight: 600 }}>{p.salesperson_name}</span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'var(--pl)', border: '1px solid var(--pb)', color: 'var(--purple)', fontWeight: 600 }}>{p.curator_name}</span>
                  {p.client_country && <span style={{ fontSize: 10, color: 'var(--muted)' }}>· {p.client_country}</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: statusColor[p.status] }}>
                  {Number(category === 'paid' ? (p.fact_sum || p.plan_sum) : p.plan_sum).toLocaleString('ru')} ₽
                </div>
                <div style={{ fontSize: 9, padding: '2px 7px', borderRadius: 12, background: statusBg[p.status], color: statusColor[p.status], fontWeight: 700, border: `1px solid ${statusColor[p.status]}22`, display: 'inline-block', marginTop: 3 }}>
                  {statusLabel[p.status]}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
