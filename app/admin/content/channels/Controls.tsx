'use client'
import { useState, useTransition } from 'react'
import { createChannel, setChannelMode, stopAllPublishing } from '../actions'
import { ПЛОЩАДКИ } from '@/lib/content/platforms'

function Ответ({ text, ошибка }: { text: string | null; ошибка?: boolean }) {
  if (!text) return null
  return (
    <div style={{ fontSize: 12, marginTop: 8, color: ошибка ? 'var(--red)' : 'var(--muted)', lineHeight: 1.5 }}>{text}</div>
  )
}

/** Включить или приостановить один канал. */
export function РежимКанала({ id, mode }: { id: number; mode: string }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState(false)

  const жми = (next: 'active' | 'paused') => start(async () => {
    const r = await setChannelMode(id, next)
    setErr('error' in r); setMsg('error' in r ? r.error : (r.note ?? 'Готово'))
  })

  return (
    <div>
      {mode === 'active'
        ? <button className="btn-s" disabled={pending} onClick={() => жми('paused')}>Приостановить</button>
        : <button className="btn-s" disabled={pending} onClick={() => жми('active')}>Включить</button>}
      <Ответ text={msg} ошибка={err} />
    </div>
  )
}

/**
 * Завести канал. Всегда приостановленным — включение отдельным действием.
 *
 * С экрана подключений площадка приходит заданной: там уже выбрали, к чему
 * подключаемся, и второй выбор в форме означал бы, что его можно сделать иначе,
 * чем нажатием в карточке.
 */
export function НовыйКанал({ площадка }: { площадка?: string } = {}) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState(false)
  const [f, setF] = useState({
    platform: площадка ?? 'telegram',
    accountExternalId: '', title: '', dailyCap: 1,
  })
  // Сайт публикуется агентом по SSH и каналом в этом смысле не заводится.
  const выбор = ПЛОЩАДКИ.filter((п) => п.код !== 'site')

  if (!open) return <button className="btn-s" onClick={() => setOpen(true)}>Завести канал</button>

  return (
    // Форма живёт и во всю ширину экрана каналов, и внутри узкой плитки на
    // экране подключений, поэтому полей не хватает не по ширине, а по месту:
    // минимальные размеры малые, перенос разрешён.
    <div style={{
      padding: 14, border: '1px solid var(--bor2)', borderRadius: 10, background: 'var(--surf2)',
      width: '100%', maxWidth: 520, boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {площадка ? (
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {выбор.find((п) => п.код === площадка)?.имя ?? площадка}
          </span>
        ) : (
          <select value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })}
            style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--bor2)', background: 'var(--surf)', color: 'var(--text)' }}>
            {выбор.map((п) => <option key={п.код} value={п.код}>{п.имя}</option>)}
          </select>
        )}
        <input placeholder="идентификатор аккаунта" value={f.accountExternalId}
          onChange={(e) => setF({ ...f, accountExternalId: e.target.value })}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bor2)', background: 'var(--surf)', color: 'var(--text)', flex: 1, minWidth: 120, boxSizing: 'border-box' }} />
        <input placeholder="название" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bor2)', background: 'var(--surf)', color: 'var(--text)', flex: 1, minWidth: 110, boxSizing: 'border-box' }} />
        <label style={{ fontSize: 12, color: 'var(--muted)' }}>
          постов в день{' '}
          <input type="number" min={1} max={10} value={f.dailyCap} onChange={(e) => setF({ ...f, dailyCap: Number(e.target.value) })}
            style={{ width: 52, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--bor2)', background: 'var(--surf)', color: 'var(--text)' }} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn-p" disabled={pending} onClick={() => start(async () => {
          const r = await createChannel(f)
          setErr('error' in r); setMsg('error' in r ? r.error : (r.note ?? 'Готово'))
          if (!('error' in r)) setF({ ...f, accountExternalId: '', title: '' })
        })}>Завести</button>
        <button className="btn-s" onClick={() => setOpen(false)}>Отмена</button>
      </div>
      <Ответ text={msg} ошибка={err} />
    </div>
  )
}

/**
 * Рубильник.
 *
 * Стоит отдельно от остальных кнопок и требует причину. Нажимают его в тот
 * момент, когда стало понятно, что выходит неправильное, а разбираться
 * некогда, — и через три дня кто-то спросит, почему ничего не выходило.
 */
export function Рубильник({ активных }: { активных: number }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState(false)

  if (!open) {
    return (
      <button className="btn-s" onClick={() => setOpen(true)}
        style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
        Остановить все новые публикации
      </button>
    )
  }

  return (
    <div style={{ padding: 14, border: '1px solid var(--red)', borderRadius: 10, background: 'var(--surf2)', maxWidth: 560 }}>
      <div style={{ fontSize: 13, marginBottom: 8, lineHeight: 1.5 }}>
        Все каналы перейдут в «остановлен» — новые публикации ставиться не будут.
        Запланированное <b>останется в плане</b>: снять его — другое решение, и принимать его в спешке не надо.
        {активных ? ` Сейчас затронет каналов: ${активных}.` : ' Сейчас включённых каналов нет.'}
      </div>
      <input placeholder="почему останавливаем" value={reason} onChange={(e) => setReason(e.target.value)}
        style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--bor2)', background: 'var(--surf)', color: 'var(--text)' }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn-p" disabled={pending} onClick={() => start(async () => {
          const r = await stopAllPublishing(reason)
          setErr('error' in r); setMsg('error' in r ? r.error : (r.note ?? 'Готово'))
          if (!('error' in r)) { setReason(''); setOpen(false) }
        })} style={{ background: 'var(--red)' }}>Остановить</button>
        <button className="btn-s" onClick={() => setOpen(false)}>Отмена</button>
      </div>
      <Ответ text={msg} ошибка={err} />
    </div>
  )
}
