'use client'

import Link from 'next/link'

interface Props {
  salespersons: any[]
  messages: any[]
  deals: any[]
  stages: any[]
  settings: any[]
}

function fmt(n: number) { return Math.round(n).toLocaleString('ru') }

function getSetting(settings: any[], key: string, fallback: any = null) {
  const s = settings.find(s => s.key === key)
  return s ? (typeof s.value === 'string' ? JSON.parse(s.value) : s.value) : fallback
}

export function ResponseDashboard({ salespersons, messages, deals, stages, settings }: Props) {
  const slaMinutes = getSetting(settings, 'sla_response_minutes', 30)

  const cardStyle: React.CSSProperties = { background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 14, padding: '16px 20px', marginBottom: 16 }
  const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12 }

  // Build deal → salesperson map
  const dealSpMap: Record<string, string> = {}
  deals.forEach(d => { if (d.salesperson_id) dealSpMap[d.id] = d.salesperson_id })

  // Group messages by deal_id, sorted by created_at ascending
  const msgByDeal: Record<string, any[]> = {}
  messages.forEach(m => {
    if (!msgByDeal[m.deal_id]) msgByDeal[m.deal_id] = []
    msgByDeal[m.deal_id].push(m)
  })
  // Messages are already ordered by created_at from server query

  // ═══ Section 1: Average response time per manager ═══
  // For each deal, find incoming→outgoing consecutive pairs and compute deltas
  const spResponseTimes: Record<string, number[]> = {}
  const spDealSets: Record<string, Set<string>> = {}

  for (const dealId of Object.keys(msgByDeal)) {
    const spId = dealSpMap[dealId]
    if (!spId) continue

    if (!spResponseTimes[spId]) spResponseTimes[spId] = []
    if (!spDealSets[spId]) spDealSets[spId] = new Set()
    spDealSets[spId].add(dealId)

    const msgs = msgByDeal[dealId]
    for (let i = 0; i < msgs.length - 1; i++) {
      if (msgs[i].direction === 'incoming' && msgs[i + 1].direction === 'outgoing') {
        const delta = (new Date(msgs[i + 1].created_at).getTime() - new Date(msgs[i].created_at).getTime()) / 60000
        if (delta >= 0) spResponseTimes[spId].push(delta)
      }
    }
  }

  const perManager = salespersons
    .filter(sp => sp.is_active)
    .map(sp => {
      const times = spResponseTimes[sp.id] || []
      const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0
      const dealCount = spDealSets[sp.id]?.size || 0
      return { ...sp, avg, dealCount, hasTimes: times.length > 0 }
    })
    .sort((a, b) => a.avg - b.avg)

  // ═══ Section 2: Unreplied deals ═══
  const nowMs = Date.now()
  const unreplied: { dealTitle: string; spName: string; waitingMin: number; dealId: string }[] = []

  for (const deal of deals) {
    const msgs = msgByDeal[deal.id]
    if (!msgs || msgs.length === 0) continue
    const lastMsg = msgs[msgs.length - 1]
    if (lastMsg.direction !== 'incoming') continue

    const waitingMin = (nowMs - new Date(lastMsg.created_at).getTime()) / 60000
    if (waitingMin <= slaMinutes) continue

    const sp = salespersons.find(s => s.id === deal.salesperson_id)
    unreplied.push({
      dealTitle: deal.title,
      spName: sp?.name || 'Неизвестный',
      waitingMin,
      dealId: deal.id,
    })
  }
  unreplied.sort((a, b) => b.waitingMin - a.waitingMin)

  function formatDuration(minutes: number) {
    if (minutes < 60) return `${fmt(minutes)} мин`
    if (minutes < 1440) return `${fmt(minutes / 60)} ч ${fmt(minutes % 60)} мин`
    return `${fmt(minutes / 1440)} д ${fmt((minutes % 1440) / 60)} ч`
  }

  return (
    <>
      {/* ═══ AVERAGE RESPONSE TIME PER MANAGER ═══ */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Среднее время ответа по менеджерам</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>
              <th style={{ padding: '6px 8px' }}>Менеджер</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Среднее время (мин)</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Сделок</th>
            </tr>
          </thead>
          <tbody>
            {perManager.map(sp => (
              <tr key={sp.id} style={{ borderTop: '1px solid var(--bor2)' }}>
                <td style={{ padding: '10px 8px', fontWeight: 600 }}>{sp.name}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                  {sp.hasTimes ? (
                    <span style={{
                      padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                      background: sp.avg > slaMinutes ? 'rgba(220,53,69,.12)' : 'rgba(22,163,97,.12)',
                      color: sp.avg > slaMinutes ? 'var(--red)' : 'var(--green)',
                    }}>{fmt(sp.avg)} мин</span>
                  ) : (
                    <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>
                  )}
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>{sp.dealCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ═══ UNREPLIED DEALS ═══ */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Сделки без ответа (SLA превышен)</div>
        {unreplied.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>Все сделки в рамках SLA</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '6px 8px' }}>Сделка</th>
                <th style={{ padding: '6px 8px' }}>Менеджер</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Ожидание</th>
              </tr>
            </thead>
            <tbody>
              {unreplied.map(u => (
                <tr key={u.dealId} style={{ borderTop: '1px solid var(--bor2)', background: 'rgba(220,53,69,.04)' }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>
                    <Link href={`/rop/funnel/${u.dealId}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>{u.dealTitle}</Link>
                  </td>
                  <td style={{ padding: '10px 8px' }}>{u.spName}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--red)', fontWeight: 700 }}>
                    {formatDuration(u.waitingMin)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ═══ SLA CONFIG ═══ */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Настройка SLA</div>
        <div style={{ fontSize: 13, color: 'var(--text)' }}>
          Текущий SLA: <span style={{ fontWeight: 700 }}>{slaMinutes} мин</span>
          <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>
            (изменить можно в <a href="/rop/settings" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>Настройках</a>)
          </span>
        </div>
      </div>
    </>
  )
}
