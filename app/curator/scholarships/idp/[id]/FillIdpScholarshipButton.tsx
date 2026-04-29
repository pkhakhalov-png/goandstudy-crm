'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  id: number
  hasData: boolean
}

export function FillIdpScholarshipButton({ id, hasData }: Props) {
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
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  async function run() {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/ai/fill-idp-scholarship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const text = await res.text()
      let data: any = null
      try { data = text ? JSON.parse(text) : null } catch {}
      if (!data) throw new Error(`HTTP ${res.status} — ${text.slice(0, 120) || 'пустой ответ'}`)
      if (!data.ok) throw new Error(data.error || 'ИИ не смог заполнить')
      const changes = data.data?.changes ?? 0
      const updated = data.data?.updated ?? []
      setToast(changes > 0 ? `Готово · обновлено: ${updated.join(', ')}` : 'Проверено, новых данных не нашлось')
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const text = busy
    ? elapsed > 60 ? `Ещё ищу… ${elapsed}s` : `ИИ ищет… ${elapsed}s`
    : hasData ? 'Обновить через ИИ' : 'Дополнить через ИИ'

  return (
    <>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={hasData ? 'btn-s' : 'btn-p'}
        style={{
          fontSize: 12,
          padding: '9px 14px',
          whiteSpace: 'nowrap',
          opacity: busy ? 0.8 : 1,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {busy ? <Spinner /> : (hasData ? <IconRefresh /> : <IconSpark />)}
        {text}
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

function IconSpark() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
    </svg>
  )
}

function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
