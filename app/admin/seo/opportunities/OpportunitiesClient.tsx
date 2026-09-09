'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { recomputeOpportunities, setOpportunityStatus, startExperiment } from './actions'

const DEC_COLOR: Record<string, string> = {
  FIX: 'var(--red)', 'MERGE/REPOSITION': 'var(--red)', REVIEW: 'var(--muted)',
  UPDATE: 'var(--green)', EXPAND: 'var(--purple)', SCHEMA: 'var(--purple)',
  LINK_ONLY: 'var(--muted)', CREATE: 'var(--purple)',
}
const RISK_RU: Record<string, string> = { low: 'низкий', medium: 'средний', high: 'высокий' }
const STATUS_RU: Record<string, string> = { new: 'новая', approved: 'одобрена', queued: 'в очереди', in_production: 'эксперимент', done: 'готово', dismissed: 'отклонена', expired: 'истекла' }

export function OpportunitiesClient({ opps }: { opps: any[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState('')
  const [filter, setFilter] = useState<string>('active')

  const act = (fn: () => Promise<any>, ok = 'готово') => start(async () => { const r = await fn(); setMsg(r?.error || ok); router.refresh() })

  const shown = opps.filter((o) => filter === 'all' ? true : filter === 'active' ? !['dismissed', 'done', 'expired'].includes(o.status) : o.status === filter)
  const byDecision: Record<string, number> = {}
  for (const o of shown) byDecision[o.decision] = (byDecision[o.decision] || 0) + 1

  const btn: React.CSSProperties = { padding: '3px 8px', borderRadius: 6, border: '1px solid var(--bor2)', background: 'var(--surf)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <button type="button" disabled={pending} onClick={() => act(() => recomputeOpportunities(), 'пересчитано')}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'var(--purple)', color: '#fff', opacity: pending ? 0.6 : 1, fontFamily: 'inherit' }}>
          {pending ? '…' : 'Пересчитать очередь'}
        </button>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ ...btn, padding: '7px 10px', fontSize: 12 }}>
          <option value="active">активные</option>
          <option value="all">все</option>
          <option value="approved">одобренные</option>
          <option value="in_production">в эксперименте</option>
          <option value="dismissed">отклонённые</option>
        </select>
        {msg && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{msg}</span>}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, fontSize: 12, color: 'var(--muted)' }}>
        <span style={{ padding: '4px 10px', border: '1px solid var(--bor2)', borderRadius: 999 }}>показано: {shown.length}</span>
        {Object.entries(byDecision).sort((a, b) => b[1] - a[1]).map(([d, n]) => (
          <span key={d} style={{ padding: '4px 10px', border: '1px solid var(--bor2)', borderRadius: 999, color: DEC_COLOR[d] || 'var(--text)' }}>{d}: {n}</span>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {shown.slice(0, 200).map((o, i) => {
          const ev = o.evidence || {}
          const url = ev.url || (ev.scope === 'query' ? `запрос: «${ev.query}»` : (o.kind))
          const canExp = o.page_ids?.length && o.status === 'new' && ['UPDATE', 'EXPAND', 'SCHEMA', 'LINK_ONLY'].includes(o.decision)
          return (
            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid var(--bor)', borderRadius: 8, fontSize: 12, flexWrap: 'wrap', opacity: ['dismissed', 'done', 'expired'].includes(o.status) ? 0.5 : 1 }}>
              <span style={{ color: 'var(--muted)', width: 22, textAlign: 'right' }}>{i + 1}</span>
              <span style={{ fontWeight: 700, color: DEC_COLOR[o.decision] || 'var(--text)', minWidth: 120 }}>{o.decision}</span>
              <span style={{ flex: 1, minWidth: 180, color: 'var(--text)', wordBreak: 'break-all' }}>
                {typeof url === 'string' ? url.replace('https://goandstudy.com', '') : url}
                <span style={{ color: 'var(--muted)' }}> — {o.decision_reason}</span>
              </span>
              {o.forecast && <span style={{ color: 'var(--green)', whiteSpace: 'nowrap' }}>+{o.forecast.conservative}/{o.forecast.base}/{o.forecast.optimistic} кл/28д</span>}
              <span style={{ padding: '1px 7px', borderRadius: 999, border: '1px solid var(--bor2)', fontSize: 10, whiteSpace: 'nowrap', color: o.risk === 'high' ? 'var(--red)' : o.risk === 'medium' ? 'var(--text)' : 'var(--muted)' }}>риск: {RISK_RU[o.risk]}</span>
              <span style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{STATUS_RU[o.status] || o.status}</span>
              <span style={{ color: 'var(--muted)', width: 48, textAlign: 'right' }}>{Math.round(o.priority)}</span>
              <span style={{ display: 'flex', gap: 4 }}>
                {canExp ? <button type="button" style={btn} disabled={pending} onClick={() => act(() => startExperiment(o.id), 'эксперимент создан')}>▶ эксп.</button> : null}
                {o.status !== 'dismissed' ? <button type="button" style={btn} disabled={pending} onClick={() => act(() => setOpportunityStatus(o.id, 'dismissed'), 'отклонено')}>✕</button> : <button type="button" style={btn} disabled={pending} onClick={() => act(() => setOpportunityStatus(o.id, 'new'), 'возвращено')}>↺</button>}
              </span>
            </div>
          )
        })}
        {shown.length > 200 && <div style={{ color: 'var(--muted)', fontSize: 12, padding: 6 }}>…ещё {shown.length - 200}</div>}
      </div>
    </div>
  )
}
