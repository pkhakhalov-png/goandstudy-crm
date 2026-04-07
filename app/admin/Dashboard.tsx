'use client'

import { useState } from 'react'

interface Props {
  clients: any[]
  payments: any[]
  expenses: any[]
  salespersons: any[]
}

const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']

export function Dashboard({ clients, payments, expenses, salespersons }: Props) {
  const [period, setPeriod] = useState<'year' | 'month'>('year')
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()

  // Фильтр по периоду
  const isInPeriod = (dateStr: string) => {
    if (!dateStr) return false
    const d = new Date(dateStr)
    if (period === 'year') return d.getFullYear() === currentYear
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth
  }

  // Общие KPI
  const totalRevenuePlan = payments.reduce((s, p) => s + Number(p.plan_sum), 0)
  const totalRevenuePaid = payments.filter(p => p.is_paid).reduce((s, p) => s + Number(p.fact_sum || p.plan_sum), 0)
  const totalOverdue = payments.filter(p => p.status === 'overdue').reduce((s, p) => s + Number(p.plan_sum), 0)
  const totalExpenses = expenses.filter(e => e.is_paid).reduce((s, e) => s + Number(e.fact_sum || e.plan_sum), 0)
  const profit = totalRevenuePaid - totalExpenses
  const newClients = clients.filter(c => isInPeriod(c.created_at)).length
  const activeClients = clients.filter(c => c.status === 'active').length

  // Данные по месяцам для графика (текущий год)
  const monthlyData = MONTHS.map((label, i) => {
    const monthPayments = payments.filter(p => {
      const d = new Date(p.plan_date)
      return d.getFullYear() === currentYear && d.getMonth() === i
    })
    const plan = monthPayments.reduce((s, p) => s + Number(p.plan_sum), 0)
    const fact = monthPayments.filter(p => p.is_paid).reduce((s, p) => s + Number(p.fact_sum || p.plan_sum), 0)
    const newC = clients.filter(c => {
      const d = new Date(c.created_at)
      return d.getFullYear() === currentYear && d.getMonth() === i
    }).length
    return { label, plan, fact, newClients: newC }
  })

  const maxVal = Math.max(...monthlyData.map(m => Math.max(m.plan, m.fact)), 1)

  // Топ продажников
  const salesStats = salespersons.map(s => {
    const myClientIds = clients.filter(c => c.salesperson_id === s.id).map(c => c.id)
    const myPayments = payments.filter(p => myClientIds.includes(p.client_id))
    const paid = myPayments.filter(p => p.is_paid).reduce((sum, p) => sum + Number(p.fact_sum || p.plan_sum), 0)
    const plan = myPayments.reduce((sum, p) => sum + Number(p.plan_sum), 0)
    const pct = plan > 0 ? Math.round(paid / plan * 100) : 0
    return { ...s, paid, plan, pct, clientsCount: myClientIds.length }
  }).sort((a, b) => b.paid - a.paid)

  const maxPaid = Math.max(...salesStats.map(s => s.paid), 1)

  // Разбивка по странам
  const countryCounts: Record<string, number> = {}
  clients.forEach(c => {
    if (c.country) countryCounts[c.country] = (countryCounts[c.country] || 0) + 1
  })
  const topCountries = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
  const maxCountry = Math.max(...topCountries.map(c => c[1]), 1)

  // Расходы по статьям
  const expenseByArticle: Record<string, number> = {}
  expenses.filter(e => e.is_paid).forEach(e => {
    expenseByArticle[e.article] = (expenseByArticle[e.article] || 0) + Number(e.fact_sum || e.plan_sum)
  })
  const articleLabels: Record<string, string> = {
    curator: 'Кураторы', salesperson: 'Продажники', visa: 'Визы', other: 'Прочее'
  }

  return (
    <div style={{ padding: '20px 28px 40px' }}>

      {/* Переключатель */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Обзор бизнеса — {period === 'year' ? currentYear : MONTHS[currentMonth]}
        </div>
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '1px solid var(--bor2)', borderRadius: 9, padding: 3 }}>
          <button onClick={() => setPeriod('month')} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', background: period === 'month' ? '#fff' : 'transparent', color: period === 'month' ? 'var(--text)' : 'var(--muted)', boxShadow: period === 'month' ? 'var(--sh)' : 'none' }}>
            Месяц
          </button>
          <button onClick={() => setPeriod('year')} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', background: period === 'year' ? '#fff' : 'transparent', color: period === 'year' ? 'var(--text)' : 'var(--muted)', boxShadow: period === 'year' ? 'var(--sh)' : 'none' }}>
            Год
          </button>
        </div>
      </div>

      {/* KPI карточки */}
      <div className="kg k4" style={{ marginBottom: 20 }}>
        <div className="kc">
          <div className="kl">Выручка факт</div>
          <div className="kv g" style={{ fontSize: 17 }}>{totalRevenuePaid.toLocaleString('ru')} ₽</div>
          <div className="ks">план: {totalRevenuePlan.toLocaleString('ru')} ₽</div>
          <div style={{ marginTop: 8, height: 4, background: 'var(--bor2)', borderRadius: 20, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(totalRevenuePlan > 0 ? Math.round(totalRevenuePaid / totalRevenuePlan * 100) : 0, 100)}%`, background: 'linear-gradient(90deg,var(--green),#5fd6a4)', borderRadius: 20 }} />
          </div>
        </div>
        <div className="kc">
          <div className="kl">Чистая прибыль</div>
          <div className="kv p" style={{ fontSize: 17 }}>{profit.toLocaleString('ru')} ₽</div>
          <div className="ks">расходы: {totalExpenses.toLocaleString('ru')} ₽</div>
        </div>
        <div className="kc">
          <div className="kl">Просрочка</div>
          <div className="kv r" style={{ fontSize: 17 }}>{totalOverdue.toLocaleString('ru')} ₽</div>
          <div className="ks">{clients.filter(c => c.payments?.some((p: any) => p.status === 'overdue')).length} клиентов</div>
        </div>
        <div className="kc">
          <div className="kl">Клиентов</div>
          <div className="kv" style={{ fontSize: 17 }}>{clients.length}</div>
          <div className="ks">{activeClients} активных · +{newClients} новых</div>
        </div>
      </div>

      {/* График выручки по месяцам */}
      <div style={{ background: '#fff', border: '1px solid var(--bor)', borderRadius: 14, padding: '20px 24px', marginBottom: 16, boxShadow: 'var(--sh)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Выручка по месяцам — {currentYear}</span>
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 3, background: 'var(--purple)', borderRadius: 2, display: 'inline-block' }} />план
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 3, background: 'var(--green)', borderRadius: 2, display: 'inline-block' }} />факт
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140 }}>
          {monthlyData.map((m, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', height: 120 }}>
                <div style={{ flex: 1, background: 'rgba(177,94,204,.2)', borderRadius: '3px 3px 0 0', height: `${Math.round(m.plan / maxVal * 100)}%`, minHeight: m.plan > 0 ? 2 : 0 }} />
                <div style={{ flex: 1, background: 'var(--green)', borderRadius: '3px 3px 0 0', height: `${Math.round(m.fact / maxVal * 100)}%`, minHeight: m.fact > 0 ? 2 : 0, opacity: 0.85 }} />
              </div>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600, marginTop: 4 }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Новые клиенты по месяцам */}
        <div style={{ background: '#fff', border: '1px solid var(--bor)', borderRadius: 14, padding: '20px 24px', boxShadow: 'var(--sh)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 20 }}>Новые клиенты — {currentYear}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
            {monthlyData.map((m, i) => {
              const maxN = Math.max(...monthlyData.map(x => x.newClients), 1)
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ width: '100%', background: 'var(--purple)', borderRadius: '3px 3px 0 0', height: `${Math.round(m.newClients / maxN * 60)}px`, minHeight: m.newClients > 0 ? 2 : 0, opacity: 0.75 }} />
                  <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{m.label}</div>
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--muted)' }}>
            Всего за год: <strong style={{ color: 'var(--text)' }}>{monthlyData.reduce((s, m) => s + m.newClients, 0)}</strong>
          </div>
        </div>

        {/* Разбивка по странам */}
        <div style={{ background: '#fff', border: '1px solid var(--bor)', borderRadius: 14, padding: '20px 24px', boxShadow: 'var(--sh)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Топ направлений</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topCountries.map(([country, count]) => (
              <div key={country} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600, width: 100, flexShrink: 0 }}>{country}</div>
                <div style={{ flex: 1, height: 6, background: 'var(--bor2)', borderRadius: 20, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round(count / maxCountry * 100)}%`, background: 'linear-gradient(90deg,var(--purple),#d47aff)', borderRadius: 20 }} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--purple)', width: 24, textAlign: 'right' }}>{count}</div>
              </div>
            ))}
            {topCountries.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Нет данных</div>}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Топ продажников */}
        <div style={{ background: '#fff', border: '1px solid var(--bor)', borderRadius: 14, padding: '20px 24px', boxShadow: 'var(--sh)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Продажники</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {salesStats.map((s, i) => (
              <div key={s.id}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: i === 0 ? 'linear-gradient(135deg,#c97d00,#ffac02)' : i === 1 ? 'linear-gradient(135deg,#8a8796,#b8b5c4)' : 'linear-gradient(135deg,var(--purple),#8b3fa8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 700 }}>
                      {i + 1}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{s.name || s.email}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>{s.paid.toLocaleString('ru')} ₽</span>
                </div>
                <div style={{ height: 4, background: 'var(--bor2)', borderRadius: 20, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round(s.paid / maxPaid * 100)}%`, background: i === 0 ? 'linear-gradient(90deg,#c97d00,#ffac02)' : 'linear-gradient(90deg,var(--purple),#d47aff)', borderRadius: 20 }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
                  {s.clientsCount} клиентов · {s.pct}% плана
                </div>
              </div>
            ))}
            {salesStats.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Нет данных</div>}
          </div>
        </div>

        {/* Расходы по статьям */}
        <div style={{ background: '#fff', border: '1px solid var(--bor)', borderRadius: 14, padding: '20px 24px', boxShadow: 'var(--sh)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Расходы по статьям</div>
          {Object.keys(expenseByArticle).length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Нет оплаченных расходов</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(expenseByArticle).sort((a, b) => b[1] - a[1]).map(([article, sum]) => {
                const maxExp = Math.max(...Object.values(expenseByArticle))
                return (
                  <div key={article}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{articleLabels[article] || article}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)' }}>{sum.toLocaleString('ru')} ₽</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--bor2)', borderRadius: 20, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.round(sum / maxExp * 100)}%`, background: 'linear-gradient(90deg,var(--gold),#ffcf6b)', borderRadius: 20 }} />
                    </div>
                  </div>
                )
              })}
              <div style={{ marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--bor)', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Итого расходов</span>
                <span style={{ fontWeight: 700, color: 'var(--red)' }}>{totalExpenses.toLocaleString('ru')} ₽</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}