'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface Props {
  deals: any[]
  stages: any[]
  salespersons: any[]
  messages: any[]
  filters: Record<string, string>
}

function fmt(n: number) { return Math.round(n).toLocaleString('ru') }

export function DealsListView({ deals, stages, salespersons, messages, filters }: Props) {
  const router = useRouter()
  const sp = useSearchParams()
  const stageMap = Object.fromEntries(stages.map(s => [s.id, s]))
  const spMap = Object.fromEntries(salespersons.map(s => [s.id, s]))

  // Apply filters
  let filtered = [...deals]
  if (filters.sp) filtered = filtered.filter(d => d.salesperson_id === filters.sp)
  if (filters.stage) filtered = filtered.filter(d => d.stage_id === filters.stage)
  if (filters.source) filtered = filtered.filter(d => d.source === filters.source)
  if (filters.critical === 'true') filtered = filtered.filter(d => d.is_critical)

  // Compute days since update
  const nowMs = Date.now()
  const enriched = filtered.map(d => {
    const daysSince = Math.round((nowMs - new Date(d.updated_at).getTime()) / 86400000)
    const lastIncoming = messages.find(m => m.deal_id === d.id && m.direction === 'incoming')
    const lastOutgoing = messages.find(m => m.deal_id === d.id && m.direction === 'outgoing')
    const unreplied = lastIncoming && (!lastOutgoing || lastOutgoing.created_at < lastIncoming.created_at)
    const waitMin = unreplied ? Math.round((nowMs - new Date(lastIncoming.created_at).getTime()) / 60000) : 0
    return { ...d, daysSince, unreplied, waitMin }
  }).sort((a, b) => b.daysSince - a.daysSince)

  const selectStyle: React.CSSProperties = { fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bor2)', background: 'var(--surf)', color: 'var(--text)' }

  function update(key: string, value: string) {
    const params = new URLSearchParams(sp.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`?${params.toString()}`)
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={filters.sp || ''} onChange={e => update('sp', e.target.value)} style={selectStyle}>
          <option value="">Все менеджеры</option>
          {salespersons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filters.stage || ''} onChange={e => update('stage', e.target.value)} style={selectStyle}>
          <option value="">Все этапы</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filters.source || ''} onChange={e => update('source', e.target.value)} style={selectStyle}>
          <option value="">Все источники</option>
          {[...new Set(deals.map(d => d.source).filter(Boolean))].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>{enriched.length} сделок</span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>
            <th style={{ padding: '6px 8px' }}>Сделка</th>
            <th style={{ padding: '6px 8px' }}>Менеджер</th>
            <th style={{ padding: '6px 8px' }}>Этап</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Бюджет</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Дней</th>
            <th style={{ padding: '6px 8px' }}>SLA</th>
          </tr>
        </thead>
        <tbody>
          {enriched.slice(0, 100).map(d => {
            const stage = stageMap[d.stage_id]
            const manager = spMap[d.salesperson_id]
            return (
              <tr key={d.id} style={{ borderTop: '1px solid var(--bor2)', background: d.is_critical ? 'rgba(220,53,69,.04)' : d.unreplied ? 'rgba(201,125,0,.04)' : undefined }}>
                <td style={{ padding: '10px 8px' }}>
                  <Link href={`/rop/funnel/${d.id}`} style={{ fontWeight: 600, color: 'var(--purple)', textDecoration: 'none' }}>{d.title}</Link>
                  {d.is_critical && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--red)' }}>КРИТИЧНО</span>}
                </td>
                <td style={{ padding: '10px 8px' }}>{manager?.name || '—'}</td>
                <td style={{ padding: '10px 8px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: (stage?.color || '#999') + '20', color: stage?.color || 'var(--muted)' }}>
                    {stage?.name || '—'}
                  </span>
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600 }}>{d.budget > 0 ? `${fmt(d.budget)} ₽` : '—'}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', color: d.daysSince > 7 ? 'var(--red)' : d.daysSince > 3 ? 'var(--gold)' : 'var(--muted)' }}>{d.daysSince}</td>
                <td style={{ padding: '10px 8px' }}>
                  {d.unreplied ? (
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--red)' }}>{d.waitMin > 60 ? `${Math.round(d.waitMin / 60)}ч` : `${d.waitMin}мин`}</span>
                  ) : (
                    <span style={{ fontSize: 10, color: 'var(--green)' }}>OK</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {enriched.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>Нет сделок по выбранным фильтрам</div>}
    </>
  )
}
