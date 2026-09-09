'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createArticleTopic } from './actions'

const short = (u: string) => (u || '').replace('https://goandstudy.com', '') || '/'

export function NewTopicForm() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [title, setTitle] = useState('')
  const [kw, setKw] = useState('')
  const [intent, setIntent] = useState('informational')
  const [res, setRes] = useState<any>(null)
  const [err, setErr] = useState('')

  const inp: React.CSSProperties = { padding: '9px 12px', borderRadius: 8, border: '1px solid var(--bor2)', background: 'var(--surf)', fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', width: '100%' }

  return (
    <div style={{ border: '1px solid var(--bor)', borderRadius: 12, padding: 16, marginBottom: 20, background: 'var(--surf2)' }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Новая статья (тема)</div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 10, alignItems: 'end' }}>
        <label style={{ fontSize: 11, color: 'var(--muted)' }}>Заголовок / тема
          <input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Как поступить в магистратуру Германии" />
        </label>
        <label style={{ fontSize: 11, color: 'var(--muted)' }}>Ключевое слово
          <input style={inp} value={kw} onChange={(e) => setKw(e.target.value)} placeholder="магистратура германия" />
        </label>
        <select style={{ ...inp, width: 'auto' }} value={intent} onChange={(e) => setIntent(e.target.value)}>
          <option value="informational">информационный</option>
          <option value="commercial">коммерческий</option>
          <option value="navigational">навигационный</option>
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <button type="button" disabled={pending || !title.trim()}
          onClick={() => start(async () => {
            setErr(''); setRes(null)
            const r = await createArticleTopic({ title: title.trim(), primary_keyword: kw.trim() || undefined, intent })
            if (!r.ok) { setErr(r.error || 'ошибка'); setRes(r.result || null) }
            else { setRes(r.result); setTitle(''); setKw('') }
            router.refresh()
          })}
          style={{ padding: '9px 18px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: pending ? 'default' : 'pointer', background: 'var(--purple)', color: '#fff', opacity: pending || !title.trim() ? 0.55 : 1, fontFamily: 'inherit' }}>
          {pending ? 'Анализ…' : 'Создать с учётом кластера'}
        </button>
        {err && <span style={{ fontSize: 12, color: 'var(--red)' }}>{err}</span>}
      </div>

      {res && (
        <div style={{ marginTop: 14, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            Кластер: <b>{res.cluster || '—'}</b>
            {res.cluster_score != null && <span style={{ color: 'var(--muted)' }}> (близость {res.cluster_score})</span>}
            {' · '}статус: <b style={{ color: res.status === 'rejected_duplicate' ? 'var(--red)' : 'var(--green)' }}>
              {res.status === 'rejected_duplicate' ? 'дубликат — уже покрыто' : 'новая'}
            </b>
          </div>
          {res.duplicates?.length > 0 && (
            <div>
              <span style={{ color: 'var(--red)' }}>Возможные дубли (каннибализация):</span>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: 'var(--muted)' }}>
                {res.duplicates.map((d: any) => <li key={d.url}>{short(d.url)} — {d.title} <span>({d.cosine})</span></li>)}
              </ul>
            </div>
          )}
          {res.link_targets?.length > 0 && (
            <div>
              <span style={{ color: 'var(--muted)' }}>Внутренние ссылки из этого кластера (добавить в статью):</span>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: 'var(--muted)' }}>
                {res.link_targets.map((d: any) => <li key={d.url}><span style={{ color: 'var(--text)' }}>{short(d.url)}</span> — {d.title} <span>({d.cosine})</span></li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
