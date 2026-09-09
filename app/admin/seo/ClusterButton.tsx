'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startClusterPages } from './actions'

export function ClusterButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState('')
  const [k, setK] = useState('')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <input value={k} onChange={(e) => setK(e.target.value.replace(/\D/g, ''))} placeholder="k (авто)"
        style={{ width: 84, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--bor2)', background: 'var(--surf)', fontSize: 12, fontFamily: 'inherit', color: 'var(--text)' }} />
      <button type="button" disabled={pending}
        onClick={() => start(async () => { const r = await startClusterPages(Number(k) || undefined); setMsg(r.error || 'Кластеризация запущена'); router.refresh() })}
        style={{ padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: pending ? 'default' : 'pointer', background: 'var(--purple)', color: '#fff', opacity: pending ? 0.6 : 1, fontFamily: 'inherit' }}>
        {pending ? '…' : 'Пересчитать кластеры'}
      </button>
      {msg && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{msg}</span>}
    </div>
  )
}
