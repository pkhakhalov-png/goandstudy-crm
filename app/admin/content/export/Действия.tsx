'use client'
import { useState, useTransition } from 'react'
import { отметитьОпубликованным, отложить } from './actions'

/**
 * Рабочее место ручной выкладки.
 *
 * Две кнопки и одно поле: скопировать текст, вставить адрес поста, отметить.
 * Больше здесь ничего не нужно — а меньше нельзя: без адреса поста переходы
 * приписать нечему, и весь смысл ручной площадки теряется.
 */
export function Выкладка({ id, текст }: { id: number; текст: string }) {
  const [pending, start] = useTransition()
  const [адрес, setАдрес] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState(false)
  const [скопировано, setСкопировано] = useState(false)
  const [снять, setСнять] = useState(false)
  const [почему, setПочему] = useState('')

  const копировать = async () => {
    try {
      await navigator.clipboard.writeText(текст)
      setСкопировано(true)
      setTimeout(() => setСкопировано(false), 2000)
    } catch {
      setErr(true); setMsg('Буфер недоступен — выдели текст выше и скопируй вручную')
    }
  }

  const отметить = () => start(async () => {
    const r = await отметитьОпубликованным(id, адрес)
    setErr('error' in r)
    setMsg('error' in r ? r.error : r.note)
    if (!('error' in r)) setАдрес('')
  })

  const снятьИзОчереди = () => start(async () => {
    const r = await отложить(id, почему)
    setErr('error' in r); setMsg('error' in r ? r.error : r.note)
  })

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn-s" onClick={копировать} type="button">
          {скопировано ? 'Скопировано' : 'Скопировать текст'}
        </button>
        <input
          placeholder="адрес поста после публикации"
          value={адрес} onChange={(e) => setАдрес(e.target.value)}
          style={{
            padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bor2)',
            background: 'var(--surf)', color: 'var(--text)', flex: 1, minWidth: 240, fontSize: 13,
          }} />
        <button className="btn-p" disabled={pending || !адрес.trim()} onClick={отметить} type="button">
          Опубликовано
        </button>
        <button className="btn-s" type="button" onClick={() => setСнять((v) => !v)}>Снять</button>
      </div>

      {снять ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input placeholder="почему снимаем" value={почему} onChange={(e) => setПочему(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bor2)',
              background: 'var(--surf)', color: 'var(--text)', flex: 1, minWidth: 240, fontSize: 13,
            }} />
          <button className="btn-s" disabled={pending || !почему.trim()} onClick={снятьИзОчереди} type="button">
            Подтвердить снятие
          </button>
        </div>
      ) : null}

      {msg ? (
        <div style={{ fontSize: 12, marginTop: 8, color: err ? 'var(--red)' : 'var(--muted)', lineHeight: 1.5 }}>{msg}</div>
      ) : null}
    </div>
  )
}
