'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startTechnicalFindings } from './actions'

export function TechnicalFindingsButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState('')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button type="button" disabled={pending}
        onClick={() => start(async () => { const r = await startTechnicalFindings(); setMsg(r.error || 'Аудит запущен'); router.refresh() })}
        style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--bor2)', fontSize: 13, fontWeight: 600, cursor: pending ? 'default' : 'pointer', background: 'var(--surf)', color: 'var(--text)', opacity: pending ? 0.6 : 1, fontFamily: 'inherit' }}>
        {pending ? '…' : 'Технический аудит'}
      </button>
      {msg && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{msg}</span>}
    </div>
  )
}
