'use client'

interface Props {
  deals: any[]
  stages: any[]
  salespersons: any[]
}

function fmt(n: number) { return Math.round(n).toLocaleString('ru') }

export function PipelineDashboard({ deals, stages, salespersons }: Props) {
  const stageMap = Object.fromEntries(stages.map(s => [s.id, s]))

  const cardStyle: React.CSSProperties = { background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 14, padding: '16px 20px', marginBottom: 16 }
  const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12 }

  // ═══ Section 1: Total pipeline value ═══
  const activeDeals = deals.filter(d => stageMap[d.stage_id]?.stage_type === 'active')
  const totalBudget = activeDeals.reduce((sum, d) => sum + (d.budget || 0), 0)
  const weightedTotal = activeDeals.reduce((sum, d) => {
    const stage = stageMap[d.stage_id]
    const weight = stage?.weight ?? 0
    return sum + (d.budget || 0) * weight
  }, 0)

  // ═══ Section 2: By stage ═══
  const activeStages = stages.filter(s => s.stage_type === 'active')
  const byStage = activeStages.map(s => {
    const stageDeals = deals.filter(d => d.stage_id === s.id)
    const budget = stageDeals.reduce((sum: number, d: any) => sum + (d.budget || 0), 0)
    const weighted = budget * (s.weight ?? 0)
    return { ...s, dealCount: stageDeals.length, budget, weighted }
  })
  const maxBudget = Math.max(...byStage.map(s => s.budget), 1)

  // ═══ Section 3: By manager ═══
  const perManager = salespersons
    .filter(sp => sp.is_active)
    .map(sp => {
      const spDeals = activeDeals.filter(d => d.salesperson_id === sp.id)
      const budget = spDeals.reduce((sum: number, d: any) => sum + (d.budget || 0), 0)
      const weighted = spDeals.reduce((sum: number, d: any) => {
        const stage = stageMap[d.stage_id]
        return sum + (d.budget || 0) * (stage?.weight ?? 0)
      }, 0)
      return { ...sp, dealCount: spDeals.length, budget, weighted }
    })
    .sort((a, b) => b.weighted - a.weighted)

  return (
    <>
      {/* ═══ TOTAL PIPELINE VALUE ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Активных сделок</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{activeDeals.length}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Сумма pipeline</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--purple)', marginTop: 4 }}>{fmt(totalBudget)} ₽</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Взвешенная сумма</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)', marginTop: 4 }}>{fmt(weightedTotal)} ₽</div>
        </div>
      </div>

      {/* ═══ BY STAGE ═══ */}
      <div style={cardStyle}>
        <div style={sectionTitle}>По этапам</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {byStage.map(s => (
            <div key={s.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                <div style={{ width: 140, fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                <div style={{ flex: 1, height: 20, background: 'var(--bor)', borderRadius: 6, position: 'relative' }}>
                  <div style={{
                    height: '100%', width: `${Math.round(s.budget / maxBudget * 100)}%`,
                    background: s.color || 'var(--purple)', borderRadius: 6, transition: 'width .3s',
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8,
                    minWidth: s.budget > 0 ? 30 : 0,
                  }}>
                    {s.budget > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{s.dealCount}</span>}
                  </div>
                </div>
                <div style={{ width: 120, textAlign: 'right', fontSize: 10, color: 'var(--text)', fontWeight: 600 }}>
                  {fmt(s.budget)} ₽
                </div>
                <div style={{ width: 100, textAlign: 'right', fontSize: 10, color: 'var(--muted)' }}>
                  взв. {fmt(s.weighted)} ₽
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ BY MANAGER ═══ */}
      <div style={cardStyle}>
        <div style={sectionTitle}>По менеджерам</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>
              <th style={{ padding: '6px 8px' }}>Менеджер</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Сделки</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Сумма</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Взвешенная</th>
            </tr>
          </thead>
          <tbody>
            {perManager.map(sp => (
              <tr key={sp.id} style={{ borderTop: '1px solid var(--bor2)' }}>
                <td style={{ padding: '10px 8px', fontWeight: 600 }}>{sp.name}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>{sp.dealCount}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600 }}>{fmt(sp.budget)} ₽</td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                  <span style={{
                    padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                    background: 'rgba(22,163,97,.12)', color: 'var(--green)',
                  }}>{fmt(sp.weighted)} ₽</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
