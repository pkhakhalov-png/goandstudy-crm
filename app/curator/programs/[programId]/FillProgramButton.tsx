'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  programId: number
  hasData: boolean
}

export function FillProgramButton({ programId, hasData }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!busy) return
    setElapsed(0)
    const t = setInterval(() => setElapsed(v => v + 1), 1000)
    return () => clearInterval(t)
  }, [busy])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  async function run() {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/ai/fill-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId }),
      })
      const ct = res.headers.get('content-type') || ''
      const isJson = ct.includes('application/json')

      if (!res.ok) {
        if (res.status === 504 || res.status === 408) {
          throw new Error('Превышено время ожидания. Попробуй ещё раз — иногда ИИ ищет дольше.')
        }
        if (isJson) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `HTTP ${res.status}`)
        }
        const text = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 120)}` : ''}`)
      }

      if (!isJson) {
        throw new Error('Сервер вернул не JSON — возможно прокси обрезало ответ.')
      }

      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'ИИ не смог заполнить')

      setToast('Готово — информация заполнена')
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const label = busy
    ? elapsed > 60
      ? `🤖 Ещё ищу… ${elapsed}s (до 2-3 мин)`
      : `🤖 ИИ ищет… ${elapsed}s`
    : hasData
      ? '🔄 Обновить через ИИ'
      : '🤖 Заполнить через ИИ'

  return (
    <>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={hasData ? 'btn-s' : 'btn-p'}
        style={{
          fontSize: 12,
          padding: '9px 16px',
          whiteSpace: 'nowrap',
          opacity: busy ? 0.8 : 1,
        }}
      >
        {label}
      </button>

      {error && (
        <div style={{
          marginTop: 8, padding: '8px 12px',
          background: 'rgba(220,53,69,.08)',
          border: '1px solid rgba(220,53,69,.2)',
          borderRadius: 8,
          fontSize: 12, color: 'var(--red)',
        }}>
          Ошибка: {error}
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
          padding: '10px 16px', borderRadius: 10, fontSize: 13,
          fontWeight: 600, color: '#fff', background: 'var(--green)',
          boxShadow: '0 6px 20px rgba(0,0,0,.18)',
        }}>
          {toast}
        </div>
      )}
    </>
  )
}
