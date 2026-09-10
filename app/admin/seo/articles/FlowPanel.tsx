'use client'
import { useState, useTransition } from 'react'
import { saveFlowSettings, startNextNow } from './actions'
import type { FlowState } from '@/lib/seo/flow'

export function FlowPanel({ state }: { state: FlowState }) {
  const [pending, start] = useTransition()
  const [s, setS] = useState(state.settings)
  const [note, setNote] = useState<string | null>(null)

  const save = (next: typeof s) => {
    setS(next)
    start(async () => {
      const r = await saveFlowSettings(next)
      setNote(r.error ?? null)
    })
  }

  return (
    <div style={{ border: '1px solid var(--bor)', borderRadius: 10, padding: 14, background: 'var(--surf)', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Поток статей</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 560, lineHeight: 1.5 }}>
            Конвейер сам берёт тему и запускает работу. Нажимать на каждую статью не нужно —
            вы только читаете готовое и решаете, выпускать ли.
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={s.enabled} disabled={pending}
            onChange={(e) => save({ ...s, enabled: e.target.checked })} />
          <span style={{ fontWeight: 700, color: s.enabled ? 'var(--green)' : 'var(--muted)' }}>
            {s.enabled ? 'включён' : 'выключен'}
          </span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12, alignItems: 'flex-end' }}>
        <Field label="Статей в неделю" hint={`запущено на этой неделе: ${state.startedThisWeek}`}>
          <select value={s.perWeek} disabled={pending} onChange={(e) => save({ ...s, perWeek: Number(e.target.value) })} style={select}>
            {[1, 2, 3, 5, 7, 10].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>

        <Field label="Предел на вычитке" hint={`сейчас ждут разбора: ${state.inReview}`}>
          <select value={s.maxInReview} disabled={pending} onChange={(e) => save({ ...s, maxInReview: Number(e.target.value) })} style={select}>
            {[2, 3, 5, 8, 12, 20].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>

        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Следующая тема</div>
          <div style={{ fontSize: 13 }}>
            {state.nextTopic
              ? <>{state.nextTopic.query} <span style={{ color: 'var(--muted)' }}>· {state.nextTopic.impressions.toLocaleString('ru')} показов</span></>
              : <span style={{ color: 'var(--muted)' }}>свободных тем нет</span>}
          </div>
        </div>

        <button className="btn-s" disabled={pending || !state.nextTopic}
          onClick={() => start(async () => {
            const r = await startNextNow()
            setNote(r.error ?? r.note ?? null)
          })}>
          Запустить сейчас
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: state.blocker ? 'var(--muted)' : 'var(--green)' }}>
        {state.blocker
          ? <>Сейчас ничего не запускается: {state.blocker}.</>
          : <>Следующая статья уйдёт в работу в ближайший ночной проход.</>}
      </div>

      {note && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--red)' }}>{note}</div>}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      {children}
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{hint}</div>
    </div>
  )
}

const select: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bor2)',
  background: 'var(--surf2)', fontSize: 13, color: 'var(--text)',
}
