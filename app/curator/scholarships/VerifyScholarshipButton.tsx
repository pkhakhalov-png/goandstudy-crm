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
        const json = await res.json()
        if (!json.ok) {
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
      setTimeout(() => setToast(null), 5000)
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
        }}
      >
        {pending ? '⏳ Проверяем...' : '🤖 Перепроверить'}
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
