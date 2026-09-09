'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generateSchema } from './actions'

export function GenerateSchemaButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState('')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button type="button" disabled={pending}
        onClick={() => start(async () => { const r: any = await generateSchema(); setMsg(r.error || `сгенерировано: ${r.generated}`); router.refresh() })}
        style={{ padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'var(--purple)', color: '#fff', opacity: pending ? 0.6 : 1, fontFamily: 'inherit' }}>
        {pending ? '…' : 'Сгенерировать schema'}
      </button>
      {msg && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{msg}</span>}
    </div>
  )
}
