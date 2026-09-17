'use client'
import { useState, useTransition } from 'react'
import { enqueueArticleIndexCheck } from './actions'

/** Спросить Google про наши статьи сейчас, не дожидаясь суточного цикла. */
export function CheckArticlesButton() {
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  return (
    <div style={{ textAlign: 'right' }}>
      <button className="btn-s" disabled={pending}
        onClick={() => start(async () => {
          try {
            const r = await enqueueArticleIndexCheck()
            setNote(r.error ?? r.note ?? null)
          } catch {
            setNote('не дошло до сервера — обнови страницу (⌘⇧R) и попробуй снова')
          }
        })}>
        {pending ? 'Ставлю в очередь…' : 'Проверить статьи'}
      </button>
      {note && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, maxWidth: 260 }}>{note}</div>}
    </div>
  )
}
