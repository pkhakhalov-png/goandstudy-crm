'use client'

import { useState, useTransition } from 'react'
import { enqueueArticle } from './actions'

export function LaunchArticle({ suggestions }: { suggestions: { topicId: number; query: string; impressions: number }[] }) {
  const [query, setQuery] = useState('')
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const launch = (q: string, topicId?: number) => start(async () => {
    setMsg(null)
    const res = await enqueueArticle(topicId ? { topicId } : { query: q })
    if (res.error) setMsg({ kind: 'err', text: res.error })
    else { setMsg({ kind: 'ok', text: 'Задача в очереди. Воркер подхватит её и напишет статью.' }); setQuery('') }
  })

  return (
    <div style={{ border: '1px solid var(--bor)', borderRadius: 10, padding: 14, background: 'var(--surf)', marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Запустить статью</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Поисковый запрос, под который пишем"
          style={{ flex: '1 1 320px', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--bor2)', background: 'var(--surf2)', fontSize: 13, color: 'var(--text)' }}
          onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) launch(query) }}
        />
        <button className="btn-p" disabled={pending || !query.trim()} onClick={() => launch(query)}>
          {pending ? 'Ставлю…' : 'В очередь'}
        </button>
      </div>

      {suggestions.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
            Запросы с показами, где сайт ниже десятого места — по ним статьи нужнее всего:
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {suggestions.map((s) => (
              <button key={s.topicId} className="btn-s" disabled={pending}
                title={`${s.impressions.toLocaleString('ru')} показов в поиске`}
                onClick={() => launch(s.query, s.topicId)}
                style={{ fontSize: 12 }}>
                {s.query} <span style={{ color: 'var(--muted)' }}>· {s.impressions.toLocaleString('ru')}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {msg && <div style={{ marginTop: 10, fontSize: 12, color: msg.kind === 'ok' ? 'var(--green)' : 'var(--red)' }}>{msg.text}</div>}
    </div>
  )
}
