'use client'
import { useState, useTransition } from 'react'
import { resolveAttention } from '../actions'

/**
 * Закрыть вопрос.
 *
 * Обязательно с объяснением. Закрытие без него — не закрытие, а забывание:
 * через месяц по строке «resolved» невозможно понять, разобрались или просто
 * устали видеть её в списке.
 */
export function Закрыть({ id }: { id: number }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState(false)

  if (!open) return <button className="btn-s" onClick={() => setOpen(true)}>Закрыть</button>

  return (
    <div style={{ minWidth: 240 }}>
      <input placeholder="чем кончилось" value={text} onChange={(e) => setText(e.target.value)}
        style={{ width: '100%', padding: '6px 9px', borderRadius: 8, border: '1px solid var(--bor2)', background: 'var(--surf)', color: 'var(--text)', fontSize: 12 }} />
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button className="btn-p" disabled={pending} onClick={() => start(async () => {
          const r = await resolveAttention(id, text)
          setErr('error' in r); setMsg('error' in r ? r.error : null)
          if (!('error' in r)) setOpen(false)
        })}>Готово</button>
        <button className="btn-s" onClick={() => setOpen(false)}>Отмена</button>
      </div>
      {msg ? <div style={{ fontSize: 11, color: err ? 'var(--red)' : 'var(--muted)', marginTop: 6, lineHeight: 1.4 }}>{msg}</div> : null}
    </div>
  )
}
