'use client'

import { useState, useTransition } from 'react'
import { addScholarshipToClient } from './actions'

interface Props {
  scholarshipId: number
  myClients: { id: number; name: string }[]
  kind?: 'private' | 'government' | 'idp'
}

export function AddScholarshipButton({ scholarshipId, myClients, kind = 'private' }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState<string | null>(null)

  function add(clientId: number) {
    if (pending) return
    const fd = new FormData()
    fd.append('scholarship_id', String(scholarshipId))
    fd.append('client_id', String(clientId))
    fd.append('kind', kind)
    startTransition(async () => {
      const res = await addScholarshipToClient(fd)
      if (res && (res as any).error) {
        setToast(`Ошибка: ${(res as any).error}`)
      } else {
        const name = myClients.find(c => c.id === clientId)?.name || `#${clientId}`
        setToast(`Добавлено в подборку «${name}» ✓`)
      }
      setOpen(false)
      setTimeout(() => setToast(null), 2400)
    })
  }

  if (myClients.length === 0) {
    return (
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>Нет клиентов</span>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={pending}
        className="btn-p"
        style={{ fontSize: 12 }}
      >
        + В подборку
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 20,
            minWidth: 220,
            background: 'var(--surf)',
            border: '1px solid var(--bor2)',
            borderRadius: 10,
            boxShadow: 'var(--sh)',
            padding: 6,
          }}
        >
          {myClients.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => add(c.id)}
              disabled={pending}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--text)',
                borderRadius: 6,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {toast && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 25,
            padding: '8px 12px',
            fontSize: 12,
            color: 'var(--text)',
            background: 'var(--surf)',
            border: '1px solid var(--bor2)',
            borderRadius: 8,
            boxShadow: 'var(--sh)',
            whiteSpace: 'nowrap',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
