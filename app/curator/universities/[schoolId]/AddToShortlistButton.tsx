'use client'

import { useState, useRef, useEffect } from 'react'
import { addToShortlist } from '@/app/curator/shortlist/actions'

interface Props {
  schoolId: number
  programId: number
  myClients: { id: number; name: string; country?: string | null }[]
}

type Toast = { message: string; kind: 'ok' | 'info' | 'err' } | null

export function AddToShortlistButton({ schoolId, programId, myClients }: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState<number | null>(null)
  const [toast, setToast] = useState<Toast>(null)
  const ref = useRef<HTMLDivElement>(null)
  const directMode = myClients.length === 1

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  async function handlePick(clientId: number) {
    if (saving !== null) return
    setSaving(clientId)
    try {
      const res = await addToShortlist({ clientId, schoolId, programId })
      setToast({
        message: res.alreadyAdded ? 'Уже в подборке' : 'Добавлено в подборку ✓',
        kind: res.alreadyAdded ? 'info' : 'ok',
      })
    } catch (e: any) {
      setToast({ message: e?.message || 'Ошибка', kind: 'err' })
    } finally {
      setSaving(null)
      setOpen(false)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => {
          if (directMode) handlePick(myClients[0].id)
          else setOpen(v => !v)
        }}
        disabled={saving !== null}
        className="btn-p"
        style={{ fontSize: 12, padding: '8px 14px', whiteSpace: 'nowrap' }}
      >
        {directMode
          ? (saving !== null ? 'Добавляем…' : '+ В подборку')
          : <>+ Добавить клиенту <span style={{ opacity: 0.8, fontSize: 10 }}>▾</span></>}
      </button>

      {!directMode && open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          right: 0,
          minWidth: 240,
          maxHeight: 320,
          overflowY: 'auto',
          background: 'var(--surf)',
          border: '1px solid var(--bor2)',
          borderRadius: 10,
          boxShadow: '0 8px 28px rgba(0,0,0,.12)',
          zIndex: 30,
          padding: 6,
        }}>
          {myClients.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
              Нет активных клиентов
            </div>
          ) : (
            myClients.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => handlePick(c.id)}
                disabled={saving !== null}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 10px',
                  background: saving === c.id ? 'var(--pl)' : 'transparent',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'var(--text)',
                  cursor: saving !== null ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (saving === null) (e.currentTarget.style.background = 'var(--rh)')
                }}
                onMouseLeave={(e) => {
                  if (saving !== c.id) (e.currentTarget.style.background = 'transparent')
                }}
              >
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                {c.country && <span style={{ color: 'var(--muted)', fontSize: 11 }}>{c.country}</span>}
              </button>
            ))
          )}
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1000,
          padding: '10px 16px',
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 600,
          color: '#fff',
          background:
            toast.kind === 'ok' ? 'var(--green)' :
            toast.kind === 'err' ? 'var(--red)' : '#0088cc',
          boxShadow: '0 6px 20px rgba(0,0,0,.18)',
          animation: 'fadeInUp 0.25s ease',
        }}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
