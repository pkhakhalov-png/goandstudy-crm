'use client'
import { useState, useTransition } from 'react'
import { revertToVersion } from '../actions'

const ORIGIN_RU: Record<string, string> = {
  generated: 'сгенерирована',
  qa_fixed: 'после починки по замечаниям',
  human_edited: 'правка человека',
  approved: 'утверждена',
  published: 'опубликована',
}

/**
 * Строка истории с возможностью вернуть версию.
 *
 * Возврат не переписывает историю: создаётся новая версия с прежним текстом,
 * и видно, откуда вернулись. На сайт ничего не уходит — публикация остаётся
 * отдельным решением, чтобы случайный клик не поменял живую страницу.
 */
export function VersionRow({ version, isCurrent, articleId, snapshot }: {
  version: { id: number; version_no: number; origin: string; created_at: string }
  isCurrent: boolean
  articleId: number
  snapshot?: boolean
}) {
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  return (
    <div style={{ fontSize: 12, padding: '6px 0', borderTop: '1px solid var(--bor)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <span>
          <b>v{version.version_no}</b> · {snapshot ? 'снимок до правки' : (ORIGIN_RU[version.origin] ?? version.origin)}
          {isCurrent && <span style={{ color: 'var(--purple)' }}> · текущая</span>}
        </span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: 'var(--muted)' }}>{new Date(version.created_at).toLocaleString('ru')}</span>
          {!isCurrent && (
            <button className="btn-s" disabled={pending} style={{ fontSize: 11, padding: '1px 7px' }}
              onClick={() => start(async () => {
                if (!confirm(`Вернуть текст версии ${version.version_no}? На сайте ничего не изменится, пока вы не опубликуете.`)) return
                const r = await revertToVersion(articleId, version.id)
                setNote(r.error ?? r.note ?? null)
              })}>
              Вернуть
            </button>
          )}
        </span>
      </div>
      {note && <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 3 }}>{note}</div>}
    </div>
  )
}
