'use client'

import { useState, useTransition } from 'react'
import { approveArticle, rejectArticle, sendDraftToWp, publishArticle } from './actions'

export function ArticleActions({ articleId, status, postId, blockers, warnings }: {
  articleId: number
  status: string
  postId: number | null
  blockers: number
  warnings: string[]
}) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const run = (fn: () => Promise<any>) => start(async () => {
    setMsg(null)
    const res = await fn()
    setMsg(res?.error ? { kind: 'err', text: res.error } : { kind: 'ok', text: 'Готово' })
  })

  const canPublish = status === 'approved' && postId && warnings.length === 0

  return (
    <div style={{ border: '1px solid var(--bor)', borderRadius: 10, padding: 14, background: 'var(--surf)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Решение</div>

      {blockers > 0 && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>
          Не пройдено блокирующих проверок: {blockers}. Публикация запрещена (§12.2).
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn-p" disabled={pending || status === 'approved' || status === 'published'}
          onClick={() => run(() => approveArticle(articleId))}>
          Утвердить
        </button>
        <button className="btn-s" disabled={pending || blockers > 0}
          onClick={() => run(() => sendDraftToWp(articleId))}>
          {postId ? 'Обновить черновик в WP' : 'Отправить черновиком в WP'}
        </button>
        <button className="btn-s" disabled={pending || !canPublish}
          onClick={() => {
            if (!confirm('Статья станет видимой в интернете. Продолжить?')) return
            run(() => publishArticle(articleId, postId!))
          }}>
          Опубликовать
        </button>
        <button className="btn-s" disabled={pending || status === 'rejected'}
          onClick={() => {
            const reason = prompt('Почему отклоняем? Причина попадёт в историю.')
            if (reason === null) return
            run(() => rejectArticle(articleId, reason))
          }}>
          Отклонить
        </button>
      </div>

      {warnings.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
          Мешает выпуску:
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {msg && (
        <div style={{ marginTop: 10, fontSize: 12, color: msg.kind === 'ok' ? 'var(--green)' : 'var(--red)' }}>
          {msg.text}
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
        Порядок по §12.1.1: сначала всегда черновик, публикация — отдельным действием.
        После выпуска система через минуту смотрит на страницу глазами бота и вернёт её
        в черновики, если что-то сломалось.
      </div>
    </div>
  )
}
