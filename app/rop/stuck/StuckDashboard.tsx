'use client'

import Link from 'next/link'

interface Props {
  salespersons: any[]
  deals: any[]
  stages: any[]
  settings: any[]
}

function fmt(n: number) { return Math.round(n).toLocaleString('ru') }

function getSetting(settings: any[], key: string, fallback: any = null) {
  const s = settings.find(s => s.key === key)
  return s ? (typeof s.value === 'string' ? JSON.parse(s.value) : s.value) : fallback
}

export function StuckDashboard({ salespersons, deals, stages, settings }: Props) {
  const stageMap = Object.fromEntries(stages.map(s => [s.id, s]))
  const spMap = Object.fromEntries(salespersons.map(sp => [sp.id, sp]))
  const stuckDays = getSetting(settings, 'stuck_deal_days', 5)
  const nowMs = Date.now()

  const cardStyle: React.CSSProperties = { background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 14, padding: '16px 20px', marginBottom: 16 }
  const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12 }

  // ═══ Section 1: Stuck deals ═══
  const activeDeals = deals.filter(d => stageMap[d.stage_id]?.stage_type === 'active')
  const stuckDeals = activeDeals
    .map(d => {
      const daysSince = Math.floor((nowMs - new Date(d.updated_at).getTime()) / 86400000)
      return { ...d, daysSince, stageName: stageMap[d.stage_id]?.name || '—', spName: spMap[d.salesperson_id]?.name || '—' }
    })
    .filter(d => d.daysSince > stuckDays)
    .sort((a, b) => b.daysSince - a.daysSince)

  // ═══ Section 2: Workload balance ═══
  const successDeals = deals.filter(d => stageMap[d.stage_id]?.stage_type === 'success')
  const activeSalespersons = salespersons.filter(sp => sp.is_active)
  const totalActive = activeDeals.length
  const avgActive = activeSalespersons.length > 0 ? totalActive / activeSalespersons.length : 0

  const workload = activeSalespersons.map(sp => {
    const active = activeDeals.filter(d => d.salesperson_id === sp.id).length
    const success = successDeals.filter(d => d.salesperson_id === sp.id).length
    const deviation = avgActive > 0 ? Math.round((active - avgActive) / avgActive * 100) : 0
    return { ...sp, active, success, deviation }
  }).sort((a, b) => b.active - a.active)

  const maxActive = Math.max(...workload.map(w => w.active), 1)

  return (
    <>
      {/* ═══ STUCK DEALS TABLE ═══ */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Застрявшие сделки (без обновлений &gt; {stuckDays} дней)</div>
        {stuckDeals.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>Нет застрявших сделок</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '6px 8px' }}>Сделка</th>
                <th style={{ padding: '6px 8px' }}>Этап</th>
                <th style={{ padding: '6px 8px' }}>Менеджер</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Дней без обновления</th>
              </tr>
            </thead>
            <tbody>
              {stuckDeals.map(d => (
                <tr key={d.id} style={{
                  borderTop: '1px solid var(--bor2)',
                  background: d.daysSince > 7 ? 'rgba(220,53,69,.06)' : d.daysSince > 3 ? 'rgba(201,125,0,.06)' : undefined,
                }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>
                    <Link href={`/rop/funnel/${d.id}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>{d.title}</Link>
                  </td>
                  <td style={{ padding: '10px 8px' }}>{d.stageName}</td>
                  <td style={{ padding: '10px 8px' }}>{d.spName}</td>
                  <td style={{
                    padding: '10px 8px', textAlign: 'right', fontWeight: 700,
                    color: d.daysSince > 7 ? 'var(--red)' : d.daysSince > 3 ? 'var(--gold)' : 'var(--text)',
                  }}>{d.daysSince}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ═══ WORKLOAD BALANCE TABLE ═══ */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Баланс нагрузки (среднее: {fmt(avgActive)} активных сделок)</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>
              <th style={{ padding: '6px 8px' }}>Менеджер</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Активные</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Успешные</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Отклонение от среднего</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Статус</th>
            </tr>
          </thead>
          <tbody>
            {workload.map(sp => (
              <tr key={sp.id} style={{ borderTop: '1px solid var(--bor2)' }}>
                <td style={{ padding: '10px 8px', fontWeight: 600 }}>{sp.name}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>{sp.active}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>{sp.success}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', color: sp.deviation > 50 ? 'var(--red)' : sp.deviation < -30 ? 'var(--blue, #3b82f6)' : 'var(--muted)' }}>
                  {sp.deviation > 0 ? '+' : ''}{sp.deviation}%
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                  {sp.deviation > 50 ? (
                    <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: 'rgba(220,53,69,.12)', color: 'var(--red)' }}>Перегружен</span>
                  ) : sp.deviation < -30 ? (
                    <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: 'rgba(59,130,246,.12)', color: 'var(--blue, #3b82f6)' }}>Недогружен</span>
                  ) : (
                    <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: 'rgba(22,163,97,.12)', color: 'var(--green)' }}>Норма</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ═══ WORKLOAD BAR CHART ═══ */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Нагрузка по менеджерам</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {workload.map(sp => (
            <div key={sp.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 120, fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sp.name}</div>
              <div style={{ flex: 1, height: 20, background: 'var(--bor)', borderRadius: 6, position: 'relative' }}>
                <div style={{
                  height: '100%', width: `${Math.round(sp.active / maxActive * 100)}%`,
                  background: sp.deviation > 50 ? 'var(--red)' : sp.deviation < -30 ? 'var(--blue, #3b82f6)' : 'var(--purple)',
                  borderRadius: 6, transition: 'width .3s',
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8,
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{sp.active}</span>
                </div>
                {/* Average line */}
                {maxActive > 0 && (
                  <div style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: `${Math.round(avgActive / maxActive * 100)}%`,
                    width: 2, borderLeft: '2px dashed var(--muted)', opacity: 0.5,
                  }} />
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>Пунктирная линия - среднее ({fmt(avgActive)})</div>
      </div>
    </>
  )
}
