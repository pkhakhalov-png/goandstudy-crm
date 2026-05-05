'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  clients: any[]
  stages: any[]
  universities: any[]
}

const badgeColors: Record<string, { bg: string; color: string }> = {
  'СТАРТ': { bg: 'rgba(177,94,204,.12)', color: 'var(--purple)' },
  'КЛЮЧЕВОЙ': { bg: 'rgba(201,125,0,.12)', color: 'var(--gold)' },
  'СОЗВОН': { bg: 'rgba(0,136,204,.12)', color: '#0088cc' },
  'ЕСЛИ НУЖНО': { bg: 'rgba(142,142,147,.1)', color: 'var(--muted)' },
  'ЗАВЕРШЁН': { bg: 'rgba(22,163,97,.12)', color: 'var(--green)' },
  'ФИНАЛ': { bg: 'rgba(22,163,97,.12)', color: 'var(--green)' },
}

export function CuratorClientsList({ clients, stages, universities }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [hoverId, setHoverId] = useState<number | null>(null)

  const stageMap = Object.fromEntries(stages.map(s => [s.code, s]))

  const filtered = clients.filter(c => {
    if (search) {
      const q = search.toLowerCase()
      const country = c.project_data?.location || c.country || ''
      if (!c.name?.toLowerCase().includes(q) && !country.toLowerCase().includes(q) && !c.phone?.includes(q)) return false
    }
    if (filterStage && c.current_stage_code !== filterStage) return false
    if (filterStatus && c.status !== filterStatus) return false
    return true
  })

  const selectStyle: React.CSSProperties = { fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bor2)', background: 'var(--surf)', color: 'var(--text)' }

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Найти клиента..." style={{ ...selectStyle, width: 220 }} />
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)} style={selectStyle}>
          <option value="">Все этапы</option>
          {stages.map(s => <option key={s.code} value={s.code}>{s.title}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="">Все статусы</option>
          <option value="active">Активные</option>
          <option value="completed">Завершённые</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--bor2)' }}>
              <th style={{ padding: '12px 16px' }}>Клиент</th>
              <th style={{ padding: '12px 12px' }}>Страна</th>
              <th style={{ padding: '12px 12px' }}>Этап</th>
              <th style={{ padding: '12px 12px' }}>Дедлайн</th>
              <th style={{ padding: '12px 12px', textAlign: 'center' }}>Статус</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const stage = stageMap[c.current_stage_code]
              const colors = stage ? (badgeColors[stage.badge] || { bg: 'rgba(177,94,204,.08)', color: 'var(--purple)' }) : { bg: 'rgba(142,142,147,.1)', color: 'var(--muted)' }
              const nearestDeadline = (universities || [])
                .filter(u => u.client_id === c.id && u.deadline)
                .sort((a: any, b: any) => a.deadline.localeCompare(b.deadline))[0]

              return (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/curator/clients/${c.id}`)}
                  onMouseEnter={() => setHoverId(c.id)}
                  onMouseLeave={() => setHoverId(null)}
                  style={{
                    borderBottom: '1px solid var(--bor)',
                    cursor: 'pointer',
                    background: hoverId === c.id ? 'rgba(177,94,204,.05)' : 'transparent',
                    transition: 'background 0.12s',
                  }}
                >
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{c.name}</div>
                    {c.telegram && <div style={{ fontSize: 10, color: 'var(--purple)', marginTop: 2 }}>{c.telegram}</div>}
                  </td>
                  <td style={{ padding: '14px 12px', color: 'var(--muted)', fontSize: 12 }}>{c.project_data?.location || c.country || '—'}</td>
                  <td style={{ padding: '14px 12px' }}>
                    {stage ? (
                      <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: colors.bg, color: colors.color }}>
                        {stage.title}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>Не начат</span>
                    )}
                  </td>
                  <td style={{ padding: '14px 12px', fontSize: 12 }}>
                    {nearestDeadline ? (
                      <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{nearestDeadline.deadline}</span>
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 8, fontSize: 10, fontWeight: 600,
                      background: c.status === 'active' ? 'rgba(22,163,97,.1)' : 'rgba(142,142,147,.1)',
                      color: c.status === 'active' ? 'var(--green)' : 'var(--muted)',
                    }}>
                      {c.status === 'active' ? 'Активен' : 'Завершён'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
            {clients.length === 0 ? 'Нет привязанных клиентов' : 'Ничего не найдено'}
          </div>
        )}
      </div>
    </div>
  )
}
