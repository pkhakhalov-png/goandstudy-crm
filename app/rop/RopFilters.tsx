'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface Props {
  salespersons: { id: string; name: string }[]
  stages?: { id: string; name: string }[]
  sources?: string[]
}

export function RopFilters({ salespersons, stages, sources }: Props) {
  const router = useRouter()
  const sp = useSearchParams()

  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const spId = sp.get('sp') || ''
  const source = sp.get('source') || ''
  const stage = sp.get('stage') || ''

  function update(key: string, value: string) {
    const params = new URLSearchParams(sp.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`?${params.toString()}`)
  }

  const selectStyle: React.CSSProperties = {
    fontSize: 12, padding: '6px 10px', borderRadius: 8,
    border: '1px solid var(--bor2)', background: 'var(--surf)',
    color: 'var(--text)', cursor: 'pointer', minWidth: 100,
  }
  const inputStyle: React.CSSProperties = {
    ...selectStyle, minWidth: 130,
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 0' }}>
      <input type="date" value={from} onChange={e => update('from', e.target.value)} style={inputStyle} title="С" />
      <input type="date" value={to} onChange={e => update('to', e.target.value)} style={inputStyle} title="По" />

      <select value={spId} onChange={e => update('sp', e.target.value)} style={selectStyle}>
        <option value="">Все менеджеры</option>
        {salespersons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      {sources && sources.length > 0 && (
        <select value={source} onChange={e => update('source', e.target.value)} style={selectStyle}>
          <option value="">Все источники</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}

      {stages && stages.length > 0 && (
        <select value={stage} onChange={e => update('stage', e.target.value)} style={selectStyle}>
          <option value="">Все этапы</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}

      {(from || to || spId || source || stage) && (
        <button
          onClick={() => router.push('?')}
          style={{ fontSize: 11, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--bor2)', background: 'var(--surf)', cursor: 'pointer', color: 'var(--muted)' }}
        >Сброс</button>
      )}
    </div>
  )
}
