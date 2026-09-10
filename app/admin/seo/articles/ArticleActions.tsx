'use client'

import { useState, useTransition } from 'react'
import { approveArticle, rejectArticle, sendDraftToWp, publishArticle, insertIncomingLinks } from './actions'

export function ArticleActions({ articleId, status, postId, blockers, warnings }: {
  articleId: number
  status: string
  postId: number | null
  blockers: number
  warnings: string[]
}) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [linkReport, setLinkReport] = useState<{ url: string; ok: boolean; note: string }[] | null>(null)

  const run = (fn: () => Promise<any>) => start(async () => {
    setMsg(null)
    const res = await fn()
    setMsg(res?.error ? { kind: 'err', text: res.error } : { kind: 'ok', text: res?.note ?? 'Готово' })
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
        <button className="btn-s" disabled={pending}
          onClick={() => start(async () => {
            setMsg(null); setLinkReport(null)
            const res: any = await insertIncomingLinks(articleId, true)
            if (res?.error) setMsg({ kind: 'err', text: res.error })
            else setLinkReport(res.report)
          })}>
          Показать, куда встанут ссылки
        </button>
        <button className="btn-s" disabled={pending || status !== 'published'}
          title={status !== 'published' ? 'Сначала публикация: ссылка на черновик ведёт в никуда' : ''}
          onClick={() => {
            if (!confirm('Ссылки будут вставлены в тексты существующих страниц. Продолжить?')) return
            start(async () => {
              setMsg(null)
              const res: any = await insertIncomingLinks(articleId, false)
              if (res?.error) setMsg({ kind: 'err', text: res.error })
              else { setLinkReport(res.report); setMsg({ kind: 'ok', text: `Вставлено ссылок: ${res.report.filter((r: any) => r.ok).length}` }) }
            })
          }}>
          Вставить ссылки
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

      {linkReport && (
        <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.5 }}>
          {linkReport.map((r, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <span style={{ color: r.ok ? 'var(--green)' : 'var(--muted)' }}>{r.ok ? '✓' : '~'}</span>{' '}
              {r.url.replace('https://goandstudy.com', '')}
              <div style={{ color: 'var(--muted)' }}>{r.note}</div>
            </div>
          ))}
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
