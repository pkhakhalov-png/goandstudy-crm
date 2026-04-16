'use client'

interface Props {
  salespersons: any[]
  deals: any[]
  stages: any[]
  activities: any[]
}

function fmt(n: number) { return Math.round(n).toLocaleString('ru') }

export function AnalyticsDashboard({ salespersons, deals, stages, activities }: Props) {
  const stageMap = Object.fromEntries(stages.map(s => [s.id, s]))
  const spMap = Object.fromEntries(salespersons.map(sp => [sp.id, sp]))

  const cardStyle: React.CSSProperties = { background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 14, padding: '16px 20px', marginBottom: 16 }
  const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12 }

  // ═══ Section 1: Lost reasons ═══
  const lostDeals = deals.filter(d => stageMap[d.stage_id]?.stage_type === 'lost')
  const totalLost = lostDeals.length

  const reasonCounts: Record<string, number> = {}
  lostDeals.forEach(d => {
    const reason = d.lost_reason || 'Не указано'
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1
  })
  const reasons = Object.entries(reasonCounts)
    .map(([reason, count]) => ({ reason, count, pct: totalLost > 0 ? Math.round(count / totalLost * 100) : 0 }))
    .sort((a, b) => b.count - a.count)

  // ═══ Section 2: At which stage we lose ═══
  const lostByStage: Record<string, number> = {}
  lostDeals.forEach(d => {
    // Find last stage_change activity before this deal became lost
    const dealActivities = activities
      .filter(a => a.deal_id === d.id)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    let lastStageName = 'Неизвестный'
    if (dealActivities.length > 0) {
      const last = dealActivities[0]
      // Try to extract from_stage from metadata
      const meta = typeof last.metadata === 'string' ? JSON.parse(last.metadata) : last.metadata
      if (meta?.from_stage_id && stageMap[meta.from_stage_id]) {
        lastStageName = stageMap[meta.from_stage_id].name
      } else if (meta?.from_stage) {
        lastStageName = meta.from_stage
      } else if (last.content) {
        lastStageName = last.content
      }
    }
    lostByStage[lastStageName] = (lostByStage[lastStageName] || 0) + 1
  })
  const lostStages = Object.entries(lostByStage)
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count)
  const maxLostStage = Math.max(...lostStages.map(s => s.count), 1)

  // ═══ Section 3: Lost by manager ═══
  const lostByManager = salespersons
    .filter(sp => sp.is_active)
    .map(sp => {
      const spDeals = deals.filter(d => d.salesperson_id === sp.id)
      const spLost = spDeals.filter(d => stageMap[d.stage_id]?.stage_type === 'lost')
      const pct = spDeals.length > 0 ? Math.round(spLost.length / spDeals.length * 100) : 0

      // Top reason for this manager
      const mReasons: Record<string, number> = {}
      spLost.forEach(d => {
        const r = d.lost_reason || 'Не указано'
        mReasons[r] = (mReasons[r] || 0) + 1
      })
      const topReason = Object.entries(mReasons).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'

      return { ...sp, lost: spLost.length, total: spDeals.length, pct, topReason }
    })
    .sort((a, b) => b.lost - a.lost)

  // ═══ Section 4: Lead sources ═══
  const sourceCounts: Record<string, { total: number; success: number }> = {}
  deals.forEach(d => {
    const src = d.source || 'Не указан'
    if (!sourceCounts[src]) sourceCounts[src] = { total: 0, success: 0 }
    sourceCounts[src].total++
    if (stageMap[d.stage_id]?.stage_type === 'success') sourceCounts[src].success++
  })
  const sources = Object.entries(sourceCounts)
    .map(([source, { total, success }]) => ({ source, total, success, conv: total > 0 ? Math.round(success / total * 100) : 0 }))
    .sort((a, b) => b.total - a.total)
  const maxSource = Math.max(...sources.map(s => s.total), 1)

  // ═══ Section 5: Best source ═══
  const bestSource = sources
    .filter(s => s.total >= 3)
    .sort((a, b) => b.conv - a.conv)[0] || null

  return (
    <>
      {/* ═══ LOST REASONS ═══ */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Причины потерь ({totalLost} сделок)</div>
        {reasons.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>Нет потерянных сделок</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '6px 8px' }}>Причина</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Кол-во</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>% от потерь</th>
              </tr>
            </thead>
            <tbody>
              {reasons.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--bor2)' }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{r.reason}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--red)', fontWeight: 700 }}>{r.count}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>{r.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ═══ LOST BY STAGE (BAR CHART) ═══ */}
      <div style={cardStyle}>
        <div style={sectionTitle}>На каком этапе теряем</div>
        {lostStages.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>Нет данных</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {lostStages.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 140, fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.stage}</div>
                <div style={{ flex: 1, height: 20, background: 'var(--bor)', borderRadius: 6, position: 'relative' }}>
                  <div style={{
                    height: '100%', width: `${Math.round(s.count / maxLostStage * 100)}%`,
                    background: 'var(--red)', borderRadius: 6, transition: 'width .3s',
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{s.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ LOST BY MANAGER ═══ */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Потери по менеджерам</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>
              <th style={{ padding: '6px 8px' }}>Менеджер</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Потеряно</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>% от своих</th>
              <th style={{ padding: '6px 8px' }}>Основная причина</th>
            </tr>
          </thead>
          <tbody>
            {lostByManager.map(sp => (
              <tr key={sp.id} style={{ borderTop: '1px solid var(--bor2)' }}>
                <td style={{ padding: '10px 8px', fontWeight: 600 }}>{sp.name}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--red)', fontWeight: 700 }}>{sp.lost}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                  <span style={{
                    padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                    background: sp.pct > 50 ? 'rgba(220,53,69,.12)' : sp.pct > 30 ? 'rgba(201,125,0,.12)' : 'rgba(22,163,97,.12)',
                    color: sp.pct > 50 ? 'var(--red)' : sp.pct > 30 ? 'var(--gold)' : 'var(--green)',
                  }}>{sp.pct}%</span>
                </td>
                <td style={{ padding: '10px 8px', fontSize: 11, color: 'var(--muted)' }}>{sp.topReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ═══ LEAD SOURCES (BAR CHART) ═══ */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Источники лидов</div>
        {sources.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>Нет данных</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
              {sources.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 140, fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.source}</div>
                  <div style={{ flex: 1, height: 20, background: 'var(--bor)', borderRadius: 6 }}>
                    <div style={{
                      height: '100%', width: `${Math.round(s.total / maxSource * 100)}%`,
                      background: 'var(--purple)', borderRadius: 6, transition: 'width .3s',
                      display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8,
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{s.total}</span>
                    </div>
                  </div>
                  <div style={{ width: 80, textAlign: 'right', fontSize: 10, color: 'var(--muted)' }}>
                    {s.success} усп. ({s.conv}%)
                  </div>
                </div>
              ))}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>
                  <th style={{ padding: '6px 8px' }}>Источник</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Сделки</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Успешные</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Конверсия</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--bor2)' }}>
                    <td style={{ padding: '10px 8px', fontWeight: 600 }}>{s.source}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>{s.total}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>{s.success}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                        background: s.conv >= 20 ? 'rgba(22,163,97,.12)' : s.conv >= 10 ? 'rgba(201,125,0,.12)' : 'rgba(220,53,69,.12)',
                        color: s.conv >= 20 ? 'var(--green)' : s.conv >= 10 ? 'var(--gold)' : 'var(--red)',
                      }}>{s.conv}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* ═══ BEST SOURCE ═══ */}
      {bestSource && (
        <div style={{ ...cardStyle, background: 'rgba(22,163,97,.06)', border: '1px solid rgba(22,163,97,.2)' }}>
          <div style={sectionTitle}>Лучший источник</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{bestSource.source}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {bestSource.total} сделок, {bestSource.success} успешных, конверсия <span style={{ fontWeight: 700, color: 'var(--green)' }}>{bestSource.conv}%</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
