'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  id: number
  kind: 'private' | 'government'
}

export function VerifyScholarshipButton({ id, kind }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  function verify() {
    if (pending) return
    setToast(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/ai/verify-scholarship', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, kind }),
        })
        const text = await res.text()
        let json: any = null
        try { json = text ? JSON.parse(text) : null } catch { /* not JSON */ }
        if (!json) {
          // Сервер вернул пусто или не-JSON (часто это 504 timeout от Vercel или 500 без тела)
          setToast({ kind: 'err', text: `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''} — ${text.slice(0, 200) || 'пустой ответ (возможно таймаут)'}` })
        } else if (!json.ok) {
          setToast({ kind: 'err', text: json.error || 'Не удалось проверить' })
        } else {
          const parts: string[] = []
          if (json.data.application_deadline) parts.push(`📅 ${json.data.application_deadline}`)
          if (json.data.official_url) parts.push(`🔗 official обновлён`)
          if (json.data.application_url) parts.push(`✅ apply обновлён`)
          if (json.data.filtered_aggregators?.official_url || json.data.filtered_aggregators?.application_url) {
            parts.push('⚠️ агрегаторы отфильтрованы')
          }
          setToast({ kind: 'ok', text: parts.length ? parts.join(' · ') : 'Проверено, изменений нет' })
          setTimeout(() => router.refresh(), 800)
        }
      } catch (e: any) {
        setToast({ kind: 'err', text: e?.message || 'Сетевая ошибка' })
      }
      setTimeout(() => setToast(null), 8000)
    })
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={verify}
        disabled={pending}
        title="ИИ-агент перепроверит дедлайн и официальную ссылку через web_search"
        style={{
          padding: '5px 10px',
          background: pending ? 'var(--bg2)' : 'rgba(177,94,204,.08)',
          border: '1px solid rgba(177,94,204,.3)',
          borderRadius: 8,
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--purple)',
          cursor: pending ? 'wait' : 'pointer',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
        </svg>
        {pending ? `Проверяем…` : 'Перепроверить'}
      </button>
      {toast && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 25,
            padding: '8px 12px',
            fontSize: 11,
            color: toast.kind === 'ok' ? 'var(--green, #2ea44f)' : 'var(--red)',
            background: 'var(--surf)',
            border: `1px solid ${toast.kind === 'ok' ? 'rgba(46,164,79,.3)' : 'rgba(255,59,48,.3)'}`,
            borderRadius: 8,
            boxShadow: 'var(--sh)',
            maxWidth: 280,
            lineHeight: 1.4,
          }}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}
