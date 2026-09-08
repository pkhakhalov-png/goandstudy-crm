'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startInventory } from './actions'

export function StartInventoryButton({ running }: { running: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState('')

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        type="button"
        disabled={pending || running}
        onClick={() => start(async () => {
          const r = await startInventory()
          setMsg(r.error ? r.error : 'Инвентарь запущен — воркер обходит страницы')
          router.refresh()
        })}
        style={{ padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: pending || running ? 'default' : 'pointer',
          background: running ? 'var(--bg)' : 'var(--purple)', color: running ? 'var(--muted)' : '#fff', opacity: pending ? 0.6 : 1, fontFamily: 'inherit' }}
      >
        {running ? 'Инвентарь идёт…' : pending ? '…' : 'Запустить инвентарь'}
      </button>
      {msg && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{msg}</span>}
      <button type="button" onClick={() => router.refresh()} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bor2)', background: 'var(--surf)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
        Обновить
      </button>
    </div>
  )
}
