'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { recomputeFindings } from './actions'

export function RecomputeFindingsButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState('')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button type="button" disabled={pending}
        onClick={() => start(async () => { const r = await recomputeFindings(); setMsg(r.error || 'Пересчёт запущен'); router.refresh() })}
        style={{ padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: pending ? 'default' : 'pointer', background: 'var(--purple)', color: '#fff', opacity: pending ? 0.6 : 1, fontFamily: 'inherit' }}>
        {pending ? '…' : 'Пересчитать находки'}
      </button>
      {msg && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{msg}</span>}
      <button type="button" onClick={() => router.refresh()} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bor2)', background: 'var(--surf)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Обновить</button>
    </div>
  )
}
