'use client'

interface Props {
  salespersons: any[]
  deals: any[]
  stages: any[]
  messages: any[]
  activities: any[]
  settings: any[]
}

function fmt(n: number) { return Math.round(n).toLocaleString('ru') }

function getSetting(settings: any[], key: string, fallback: any = null) {
  const s = settings.find(s => s.key === key)
  return s ? (typeof s.value === 'string' ? JSON.parse(s.value) : s.value) : fallback
}

export function ConversionDashboard({ salespersons, deals, stages, messages, activities, settings }: Props) {
  const stageMap = Object.fromEntries(stages.map(s => [s.id, s]))
  const lowConvThreshold = getSetting(settings, 'low_conversion_threshold', 0.7)
  const stuckDays = getSetting(settings, 'stuck_deal_days', 5)

  const cardStyle: React.CSSProperties = { background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 14, padding: '16px 20px', marginBottom: 16 }
  const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12 }

  // ═══ Exclude Группы, merge Новые заявки + Релокац ═══
  const excludeNames = ['Группы']
  const mergeIntoNew = ['Релокац']
  const paymentNames = ['Первичная продажа', 'Оплата услуг']
  const excludeIds = new Set(stages.filter(s => excludeNames.includes(s.name)).map(s => s.id))
  const mergeIds = new Set(stages.filter(s => mergeIntoNew.includes(s.name)).map(s => s.id))
  const paymentIds = new Set(stages.filter(s => paymentNames.includes(s.name)).map(s => s.id))
  const newLeadsStage = stages.find(s => s.name === 'Новые заявки')

  // Filtered deals (no groups)
  const filteredDeals = deals.filter(d => !excludeIds.has(d.stage_id))

  // Visible stages for funnel chart (no groups, no reloc, no payment stages)
  const visibleStages = stages.filter(s => !excludeNames.includes(s.name) && !mergeIntoNew.includes(s.name) && !paymentNames.includes(s.name) && s.stage_type !== 'lost' && s.stage_type !== 'paused')

  // ═══ Stage-to-stage funnel ═══
  const stageCounts = visibleStages.map(s => {
    let count: number
    if (s.id === newLeadsStage?.id) {
      // Merge: count deals in Новые заявки + Релокац + any stage after them
      count = filteredDeals.filter(d => {
        const ds = stageMap[d.stage_id]
        return ds && (mergeIds.has(d.stage_id) || ds.position >= s.position) && ds.stage_type !== 'lost' && ds.stage_type !== 'paused'
      }).length
    } else {
      count = filteredDeals.filter(d => {
        const ds = stageMap[d.stage_id]
        return ds && ds.position >= s.position && ds.stage_type !== 'lost' && ds.stage_type !== 'paused'
      }).length
    }
    return { ...s, count }
  })

  const maxCount = Math.max(...stageCounts.map(s => s.count), 1)

  const stageDropoffs = stageCounts.map((s, i) => {
    const next = stageCounts[i + 1]
    const dropoff = next && s.count > 0 ? Math.round((1 - next.count / s.count) * 100) : null
    const conversion = next && s.count > 0 ? Math.round(next.count / s.count * 100) : null
    return { ...s, dropoff, conversion }
  })

  const convRates = stageDropoffs.filter(s => s.conversion !== null).map(s => s.conversion!)
  const avgConv = convRates.length > 0 ? convRates.reduce((a, b) => a + b, 0) / convRates.length : 0

  // ═══ Overall conversion: leads → оплата ═══
  const totalDeals = filteredDeals.length
  const successDeals = filteredDeals.filter(d => paymentIds.has(d.stage_id)).length
  const overallConv = totalDeals > 0 ? Math.round(successDeals / totalDeals * 100) : 0

  // ═══ Per-manager conversion ═══
  const perManager = salespersons
    .filter(sp => sp.is_active)
    .map(sp => {
      const spDeals = filteredDeals.filter(d => d.salesperson_id === sp.id)
      const spSuccess = spDeals.filter(d => paymentIds.has(d.stage_id))
      const conv = spDeals.length > 0 ? Math.round(spSuccess.length / spDeals.length * 100) : 0
      return { ...sp, total: spDeals.length, success: spSuccess.length, conv }
    })
    .sort((a, b) => b.conv - a.conv)

  // ═══ AI Analysis: problem stages ═══
  const problems: { stage: string; conv: number; deviation: number; worstManagers: string[]; reason: string }[] = []

  stageDropoffs.forEach(s => {
    if (s.conversion === null) return
    if (avgConv > 0 && s.conversion < avgConv * lowConvThreshold) {
      // Detect reason via heuristics
      const stageDeals = deals.filter(d => stageMap[d.stage_id]?.id === s.id)
      const stageDealIds = new Set(stageDeals.map(d => d.id))

      // Heuristic 1: no activity > N days
      const nowMs = Date.now()
      const stuckCount = stageDeals.filter(d => (nowMs - new Date(d.updated_at).getTime()) / 86400000 > stuckDays).length
      const stuckPct = stageDeals.length > 0 ? stuckCount / stageDeals.length : 0

      // Heuristic 2: fast lost (deals created and moved to lost < 3 days)
      const lostFast = deals.filter(d => stageMap[d.stage_id]?.stage_type === 'lost' && d.closed_at && (new Date(d.closed_at).getTime() - new Date(d.created_at).getTime()) / 86400000 < 3).length
      const lostFastPct = totalDeals > 0 ? lostFast / totalDeals : 0

      // Heuristic 3: many messages but no stage progress
      const highTouchCount = stageDeals.filter(d => {
        const mCount = messages.filter(m => m.deal_id === d.id).length
        return mCount > 10
      }).length
      const highTouchPct = stageDeals.length > 0 ? highTouchCount / stageDeals.length : 0

      let reason = 'Конверсия ниже нормы'
      if (stuckPct > 0.5) reason = 'Сделки не ведутся (нет активности)'
      else if (lostFastPct > 0.3) reason = 'Плохая квалификация (быстрые потери)'
      else if (highTouchPct > 0.3) reason = 'Слабый дожим (много касаний без результата)'

      // Worst managers at this stage
      const spCounts: Record<string, number> = {}
      stageDeals.forEach(d => { if (d.salesperson_id) spCounts[d.salesperson_id] = (spCounts[d.salesperson_id] || 0) + 1 })
      const worstManagers = Object.entries(spCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => salespersons.find(sp => sp.id === id)?.name || 'Неизвестный')

      problems.push({
        stage: s.name,
        conv: s.conversion,
        deviation: Math.round((1 - s.conversion / avgConv) * 100),
        worstManagers,
        reason,
      })
    }
  })

  return (
    <>
      {/* ═══ FUNNEL ═══ */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Воронка по этапам</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {stageDropoffs.map(s => (
            <div key={s.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                <div style={{ width: 140, fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                <div style={{ flex: 1, height: 20, background: 'var(--bor)', borderRadius: 6, position: 'relative' }}>
                  <div style={{
                    height: '100%', width: `${Math.round(s.count / maxCount * 100)}%`,
                    background: s.color || 'var(--purple)', borderRadius: 6, transition: 'width .3s',
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{s.count}</span>
                  </div>
                </div>
                <div style={{ width: 60, textAlign: 'right', fontSize: 10, color: 'var(--muted)' }}>
                  {s.dropoff !== null ? <span style={{ color: s.dropoff > 50 ? 'var(--red)' : 'var(--muted)' }}>-{s.dropoff}%</span> : '—'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ OVERALL CONVERSION ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Всего сделок</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{totalDeals}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Оплата</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)', marginTop: 4 }}>{successDeals}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Конверсия</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: overallConv >= 20 ? 'var(--green)' : overallConv >= 10 ? 'var(--gold)' : 'var(--red)', marginTop: 4 }}>{overallConv}%</div>
        </div>
      </div>

      {/* ═══ PER MANAGER ═══ */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Конверсия по менеджерам</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>
              <th style={{ padding: '6px 8px' }}>Менеджер</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Сделки</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Оплата</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Конверсия</th>
            </tr>
          </thead>
          <tbody>
            {perManager.map(sp => (
              <tr key={sp.id} style={{ borderTop: '1px solid var(--bor2)' }}>
                <td style={{ padding: '10px 8px', fontWeight: 600 }}>{sp.name}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>{sp.total}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>{sp.success}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                  <span style={{
                    padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                    background: sp.conv >= 20 ? 'rgba(22,163,97,.12)' : sp.conv >= 10 ? 'rgba(201,125,0,.12)' : 'rgba(220,53,69,.12)',
                    color: sp.conv >= 20 ? 'var(--green)' : sp.conv >= 10 ? 'var(--gold)' : 'var(--red)',
                  }}>{sp.conv}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ═══ AI PROBLEMS ═══ */}
      {problems.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionTitle}>Проблемы в воронке</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '6px 8px' }}>Этап</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Конверсия</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Отклонение</th>
                <th style={{ padding: '6px 8px' }}>Причина</th>
                <th style={{ padding: '6px 8px' }}>Менеджеры</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((p, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--bor2)', background: 'rgba(220,53,69,.04)' }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{p.stage}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--red)', fontWeight: 700 }}>{p.conv}%</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--red)' }}>-{p.deviation}%</td>
                  <td style={{ padding: '10px 8px', fontSize: 11, color: 'var(--text)' }}>{p.reason}</td>
                  <td style={{ padding: '10px 8px', fontSize: 11, color: 'var(--muted)' }}>{p.worstManagers.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
