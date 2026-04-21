'use client'

import Link from 'next/link'

interface Props {
  tasks: any[]
  deals: any[]
  salespersons: any[]
}

function fmt(n: number) { return Math.round(n).toLocaleString('ru') }

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function OverdueTasksDashboard({ tasks, deals, salespersons }: Props) {
  const dealMap = Object.fromEntries(deals.map(d => [d.id, d]))
  const spMap = Object.fromEntries(salespersons.map(sp => [sp.id, sp]))
  const nowMs = Date.now()

  const cardStyle: React.CSSProperties = { background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 14, padding: '16px 20px', marginBottom: 16 }
  const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12 }

  // Enrich tasks with deal/salesperson info
  const enriched = tasks.map(t => {
    const deal = dealMap[t.deal_id]
    const spId = t.assigned_to || deal?.salesperson_id
    const sp = spMap[spId]
    const deadlineMs = new Date(t.deadline).getTime()
    const daysOverdue = Math.floor((nowMs - deadlineMs) / 86400000)
    const isOverdue = !t.is_done && deadlineMs < nowMs
    return { ...t, dealTitle: deal?.title || '—', spName: sp?.name || '—', spId: spId || null, daysOverdue, isOverdue }
  })

  // ═══ Section 1: Overdue tasks ═══
  const overdueTasks = enriched
    .filter(t => t.isOverdue)
    .sort((a, b) => b.daysOverdue - a.daysOverdue)

  // ═══ Section 2: By manager summary ═══
  const managerOverdue: Record<string, { count: number; oldest: string }> = {}
  overdueTasks.forEach(t => {
    const key = t.spId || '__unknown'
    if (!managerOverdue[key]) managerOverdue[key] = { count: 0, oldest: t.deadline }
    managerOverdue[key].count++
    if (new Date(t.deadline).getTime() < new Date(managerOverdue[key].oldest).getTime()) {
      managerOverdue[key].oldest = t.deadline
    }
  })
  const managerSummary = Object.entries(managerOverdue)
    .map(([spId, data]) => ({
      name: spMap[spId]?.name || 'Неизвестный',
      count: data.count,
      oldest: data.oldest,
    }))
    .sort((a, b) => b.count - a.count)

  const maxOverdue = managerSummary.length > 0 ? managerSummary[0].count : 0

  // ═══ Section 3: All open tasks grouped by salesperson ═══
  const grouped: Record<string, any[]> = {}
  enriched.forEach(t => {
    const key = t.spId || '__unknown'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(t)
  })
  // Sort tasks within groups by deadline
  Object.values(grouped).forEach(arr => arr.sort((a: any, b: any) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()))

  const groupEntries = Object.entries(grouped)
    .map(([spId, tasks]) => ({ name: spMap[spId]?.name || 'Неизвестный', tasks }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  return (
    <>
      {/* ═══ OVERDUE TASKS ═══ */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Просроченные задачи ({overdueTasks.length})</div>
        {overdueTasks.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>Нет просроченных задач</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '6px 8px' }}>Задача</th>
                <th style={{ padding: '6px 8px' }}>Сделка</th>
                <th style={{ padding: '6px 8px' }}>Менеджер</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Дедлайн</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Просрочено дней</th>
              </tr>
            </thead>
            <tbody>
              {overdueTasks.map(t => (
                <tr key={t.id} style={{ borderTop: '1px solid var(--bor2)', background: 'rgba(220,53,69,.06)' }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{t.title}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <Link href={`/rop/funnel/${t.deal_id}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>{t.dealTitle}</Link>
                  </td>
                  <td style={{ padding: '10px 8px' }}>{t.spName}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 11, color: 'var(--muted)' }}>{fmtDate(t.deadline)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--red)' }}>{t.daysOverdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ═══ BY MANAGER SUMMARY ═══ */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Просрочки по менеджерам</div>
        {managerSummary.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>Нет просроченных задач</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '6px 8px' }}>Менеджер</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Просроченных</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Самая старая</th>
              </tr>
            </thead>
            <tbody>
              {managerSummary.map((m, i) => (
                <tr key={i} style={{
                  borderTop: '1px solid var(--bor2)',
                  background: i === 0 && m.count > 0 ? 'rgba(220,53,69,.06)' : undefined,
                }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{m.name}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--red)', fontWeight: 700 }}>{m.count}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 11, color: 'var(--red)' }}>{fmtDate(m.oldest)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ═══ ALL OPEN TASKS GROUPED ═══ */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Все открытые задачи ({enriched.length})</div>
        {groupEntries.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>Нет открытых задач</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {groupEntries.map((group, gi) => (
              <div key={gi}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6, padding: '4px 8px', background: 'var(--bor)', borderRadius: 6 }}>
                  {group.name} ({group.tasks.length})
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <tbody>
                    {group.tasks.map((t: any) => (
                      <tr key={t.id} style={{
                        borderTop: '1px solid var(--bor2)',
                        background: t.isOverdue ? 'rgba(220,53,69,.06)' : undefined,
                      }}>
                        <td style={{ padding: '8px 8px', fontWeight: 600, color: t.isOverdue ? 'var(--red)' : 'var(--text)' }}>{t.title}</td>
                        <td style={{ padding: '8px 8px', fontSize: 11 }}>
                          <Link href={`/rop/funnel/${t.deal_id}`} style={{ color: 'var(--muted)', textDecoration: 'none' }}>{t.dealTitle}</Link>
                        </td>
                        <td style={{ padding: '8px 8px', textAlign: 'right', fontSize: 11, color: t.isOverdue ? 'var(--red)' : 'var(--muted)' }}>
                          {fmtDate(t.deadline)}
                          {t.isOverdue && <span style={{ marginLeft: 6, fontWeight: 700 }}>(-{t.daysOverdue}д)</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
