'use client'

import Link from 'next/link'

interface Props {
  clients: any[]
  stages: any[]
  clientStages: any[]
  universities: any[]
  messages: any[]
  curatorId: string | null
}

const cardStyle: React.CSSProperties = { background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 14, padding: '16px 20px', marginBottom: 16 }
const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12 }

const badgeColors: Record<string, { bg: string; color: string }> = {
  'СТАРТ': { bg: 'rgba(177,94,204,.12)', color: 'var(--purple)' },
  'КЛЮЧЕВОЙ': { bg: 'rgba(201,125,0,.12)', color: 'var(--gold)' },
  'СОЗВОН': { bg: 'rgba(0,136,204,.12)', color: '#0088cc' },
  'ЕСЛИ НУЖНО': { bg: 'rgba(142,142,147,.1)', color: 'var(--muted)' },
  'ЗАВЕРШЁН': { bg: 'rgba(22,163,97,.12)', color: 'var(--green)' },
  'ФИНАЛ': { bg: 'rgba(22,163,97,.12)', color: 'var(--green)' },
}

export function CuratorDashboard({ clients, stages, clientStages, universities, messages, curatorId }: Props) {
  const now = Date.now()
  const today = new Date().toISOString().split('T')[0]

  // ═══ UNREPLIED CLIENTS ═══
  const clientIds = new Set(clients.map(c => c.id))
  const msgByClient: Record<number, any[]> = {}
  messages.filter(m => clientIds.has(m.client_id)).forEach(m => {
    if (!msgByClient[m.client_id]) msgByClient[m.client_id] = []
    msgByClient[m.client_id].push(m)
  })

  const unreplied: { client: any; waitHours: number }[] = []
  clients.forEach(c => {
    const msgs = msgByClient[c.id]
    if (!msgs || msgs.length === 0) return
    const last = msgs[0] // already sorted desc
    if (last.direction === 'incoming' && last.sender_role !== 'curator') {
      const waitHours = Math.round((now - new Date(last.created_at).getTime()) / 3600000)
      if (waitHours >= 1) unreplied.push({ client: c, waitHours })
    }
  })
  unreplied.sort((a, b) => b.waitHours - a.waitHours)

  // ═══ UPCOMING DEADLINES ═══
  const in30days = new Date(now + 30 * 86400000).toISOString().split('T')[0]
  const upcomingDeadlines = (universities || [])
    .filter(u => u.deadline && u.deadline >= today && u.deadline <= in30days && clientIds.has(u.client_id))
    .sort((a: any, b: any) => a.deadline.localeCompare(b.deadline))

  // ═══ CLIENTS BY STAGE ═══
  const clientsByStage: Record<string, any[]> = {}
  stages.forEach(s => { clientsByStage[s.code] = [] })
  clients.forEach(c => {
    const code = c.current_stage_code || 'onboarding'
    if (!clientsByStage[code]) clientsByStage[code] = []
    clientsByStage[code].push(c)
  })

  if (!curatorId) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Профиль куратора не привязан</div>
        <div style={{ fontSize: 13 }}>Обратитесь к администратору для настройки</div>
      </div>
    )
  }

  return (
    <>
      {/* ═══ UNREPLIED ═══ */}
      {unreplied.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionTitle}>Непрочитанные ({unreplied.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {unreplied.slice(0, 6).map(({ client: c, waitHours }) => (
              <Link key={c.id} href={`/curator/clients/${c.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: 'rgba(220,53,69,.05)', border: '1px solid rgba(220,53,69,.15)' }}>
                <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{c.name}</div>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--red)' }}>
                  {waitHours >= 24 ? `${Math.round(waitHours / 24)}д` : `${waitHours}ч`} без ответа
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ═══ MINI STATS ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--purple)' }}>{clients.length}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Активных клиентов</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 22, fontWeight: 800, color: unreplied.length > 0 ? 'var(--red)' : 'var(--green)' }}>{unreplied.length}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Без ответа</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 22, fontWeight: 800, color: upcomingDeadlines.length > 0 ? 'var(--gold)' : 'var(--green)' }}>{upcomingDeadlines.length}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Дедлайнов 30д</div>
        </div>
      </div>

      {/* ═══ CLIENTS BY STAGE (kanban) ═══ */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Клиенты по этапам</div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stages.length}, 1fr)`, gap: 6 }}>
          {stages.map(s => {
            const stageClients = clientsByStage[s.code] || []
            const colors = badgeColors[s.badge] || { bg: 'rgba(177,94,204,.08)', color: 'var(--purple)' }
            return (
              <div key={s.id} style={{
                background: stageClients.length > 0 ? 'var(--bg)' : 'transparent',
                borderRadius: 10, padding: '10px 8px', minHeight: 80,
              }}>
                {/* Stage header */}
                <div style={{ textAlign: 'center', marginBottom: 8 }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                    fontSize: 8, fontWeight: 800, letterSpacing: '0.04em',
                    background: colors.bg, color: colors.color,
                    textTransform: 'uppercase',
                  }}>
                    {s.badge || s.code}
                  </span>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text)', marginTop: 4, lineHeight: 1.2 }}>
                    {s.title}
                  </div>
                  {stageClients.length > 0 && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 18, height: 18, borderRadius: '50%', fontSize: 9, fontWeight: 800,
                      background: colors.color, color: '#fff', marginTop: 4,
                    }}>
                      {stageClients.length}
                    </div>
                  )}
                </div>

                {/* Client cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {stageClients.map(c => (
                    <Link key={c.id} href={`/curator/clients/${c.id}`} style={{
                      textDecoration: 'none', padding: '8px 10px', borderRadius: 8,
                      background: 'var(--surf)', border: '1px solid var(--bor)',
                      boxShadow: '0 1px 3px rgba(0,0,0,.04)',
                      transition: 'border-color .15s',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{c.name}</div>
                      {c.country && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{c.country}</div>}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ═══ UPCOMING DEADLINES ═══ */}
      {upcomingDeadlines.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionTitle}>Ближайшие дедлайны вузов</div>
          {upcomingDeadlines.slice(0, 8).map((u: any) => {
            const client = clients.find(c => c.id === u.client_id)
            const daysLeft = Math.round((new Date(u.deadline).getTime() - now) / 86400000)
            return (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--bor)', marginBottom: 4 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{u.university_name}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{client?.name}</div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: daysLeft <= 7 ? 'var(--red)' : daysLeft <= 14 ? 'var(--gold)' : 'var(--muted)' }}>
                  {daysLeft}д
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{u.deadline}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ EMPTY STATE ═══ */}
      {clients.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Нет активных клиентов</div>
          <div style={{ fontSize: 13 }}>Клиенты появятся после назначения администратором</div>
        </div>
      )}
    </>
  )
}
