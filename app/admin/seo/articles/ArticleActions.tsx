'use client'

import { useState, useTransition } from 'react'
import { approveArticle, rejectArticle, publishToBlog, requestFix, insertIncomingLinks } from './actions'

export function ArticleActions({ articleId, status, blockers, warnings }: {
  articleId: number
  status: string
  blockers: number
  warnings: string[]
}) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [linkReport, setLinkReport] = useState<{ url: string; ok: boolean; note: string }[] | null>(null)

  // Ошибку действия обязательно показываем: молчащая кнопка — худшее, что может быть.
  // Отдельный случай — устаревшая вкладка после деплоя: Next привязывает действия
  // к версии сборки, и со старой страницы нажатие не доходит до сервера вовсе.
  const run = (fn: () => Promise<any>) => start(async () => {
    setMsg(null)
    try {
      const res = await fn()
      setMsg(res?.error ? { kind: 'err', text: res.error } : { kind: 'ok', text: res?.note ?? 'Готово' })
    } catch (e: any) {
      setMsg({
        kind: 'err',
        text: `Не отправилось: ${e?.message ?? 'ошибка'}. Если страница открыта давно — обнови её (⌘⇧R) и повтори.`,
      })
    }
  })

  const canPublish = status === 'approved' && warnings.length === 0

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

        <button className="btn-s" disabled={pending || status === 'published'}
          title="Модель перепишет отмеченные места и отчёт обновится"
          onClick={() => run(() => requestFix(articleId))}>
          Исправить замечания
        </button>

        <button className="btn-s" disabled={pending}
          onClick={() => run(() => publishToBlog(articleId, true))}>
          План публикации
        </button>

        <button className="btn-s" disabled={pending || !canPublish}
          title={!canPublish ? 'Сначала «Утвердить» и закрыть то, что мешает выпуску' : ''}
          onClick={() => {
            if (!confirm('Статья появится на сайте в блоге и станет видимой в интернете. Продолжить?')) return
            run(() => publishToBlog(articleId, false))
          }}>
          Опубликовать в блог
        </button>

        <button className="btn-s" disabled={pending}
          onClick={() => start(async () => {
            setMsg(null); setLinkReport(null)
            try {
              const res: any = await insertIncomingLinks(articleId, true)
              if (res?.error) setMsg({ kind: 'err', text: res.error })
              else setLinkReport(res.report)
            } catch (e: any) {
              setMsg({ kind: 'err', text: `Не отправилось: ${e?.message ?? 'ошибка'}. Обнови страницу (⌘⇧R) и повтори.` })
            }
          })}>
          Показать, куда встанут ссылки
        </button>

        <button className="btn-s" disabled={pending || status !== 'published'}
          title={status !== 'published' ? 'Сначала публикация: ссылка на неопубликованную статью ведёт в никуда' : ''}
          onClick={() => {
            if (!confirm('Ссылки будут вставлены в тексты существующих страниц. Продолжить?')) return
            run(() => insertIncomingLinks(articleId, false))
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
        Статья блога — это файлы в теме сайта, а не запись WordPress. Публикация кладёт
        тело, обложку и строку в реестр, бампает сид-флаг и сразу проверяет страницу:
        отдаётся ли, есть ли описание и разметка, появилась ли карточка на /blog/.
      </div>
    </div>
  )
}
