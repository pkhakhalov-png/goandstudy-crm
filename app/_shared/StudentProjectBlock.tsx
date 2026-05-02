'use client'

import { useState, useTransition } from 'react'
import { saveProjectField, saveProjectNote } from '@/lib/student-project-actions'
import { STUDENT_PROJECT_FIELDS, type StudentProjectData } from '@/lib/client-data'

interface Props {
  clientId: number
  initial: StudentProjectData
  /** Read-only режим (например предпросмотр админом). По умолчанию редактирование разрешено. */
  readOnly?: boolean
}

const FIELDS = STUDENT_PROJECT_FIELDS

export function StudentProjectBlock({ clientId, initial, readOnly }: Props) {
  const [data, setData] = useState<StudentProjectData>(initial || {})
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [noteEditing, setNoteEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const filledCount = FIELDS.filter(f => (data[f.key] || '').trim().length > 0).length

  const persistField = (key: string, value: string) => {
    setErr(null)
    startTransition(async () => {
      const r = await saveProjectField({ clientId, key, value })
      if (!r.ok) setErr(r.error)
      else {
        setData(d => ({ ...d, [key]: value, updated_at: new Date().toISOString() }))
        setEditingKey(null)
      }
    })
  }

  const persistNote = (note: string) => {
    setErr(null)
    startTransition(async () => {
      const r = await saveProjectNote({ clientId, note })
      if (!r.ok) setErr(r.error)
      else {
        setData(d => ({ ...d, note, updated_at: new Date().toISOString() }))
        setNoteEditing(false)
      }
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--ds-purple)', marginBottom: 4 }}>
            Стратегическая сессия
          </div>
          <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--ds-ink)' }}>
            Проект студента
          </h3>
        </div>
        <div style={{ fontSize: 11, color: 'var(--ds-muted)', textAlign: 'right' }}>
          {filledCount} / {FIELDS.length} полей заполнено
          {data.updated_at && (
            <div>
              {data.updated_by_name ? `${data.updated_by_name}, ` : ''}
              {new Date(data.updated_at).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
            </div>
          )}
        </div>
      </div>

      {err && (
        <div style={{ padding: '8px 12px', background: '#FEE2E2', color: '#B91C1C', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
          {err}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 20 }}>
        {FIELDS.map((f, idx) => (
          <Row
            key={f.key}
            label={f.label}
            value={data[f.key] || ''}
            placeholder={f.placeholder}
            multiline={f.multiline}
            isFirst={idx === 0}
            isEditing={editingKey === f.key}
            disabled={!!readOnly || pending}
            onStart={() => setEditingKey(f.key)}
            onCancel={() => setEditingKey(null)}
            onSave={(v) => persistField(f.key, v)}
          />
        ))}
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ds-muted)', marginBottom: 8 }}>
          Заметка куратора
        </div>
        {noteEditing ? (
          <Editor
            initial={data.note || ''}
            multiline
            disabled={pending}
            onSave={persistNote}
            onCancel={() => setNoteEditing(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => !readOnly && setNoteEditing(true)}
            disabled={!!readOnly}
            style={{
              background: 'var(--ds-bg-alt)',
              border: '1px solid var(--ds-border-soft)',
              borderRadius: 'var(--ds-r-md)',
              padding: '14px 16px',
              fontSize: 13, lineHeight: 1.55,
              color: 'var(--ds-ink)',
              textAlign: 'left',
              fontFamily: 'var(--ds-font)',
              cursor: readOnly ? 'default' : 'text',
              width: '100%',
            }}
          >
            {data.note || <span style={{ color: 'var(--ds-muted)' }}>Заметка ещё не добавлена</span>}
          </button>
        )}
      </div>
    </div>
  )
}

function Row({
  label, value, placeholder, multiline, isFirst, isEditing, disabled,
  onStart, onCancel, onSave,
}: {
  label: string
  value: string
  placeholder?: string
  multiline?: boolean
  isFirst: boolean
  isEditing: boolean
  disabled: boolean
  onStart: () => void
  onCancel: () => void
  onSave: (v: string) => void
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '140px 1fr',
      gap: 12,
      padding: '12px 0',
      borderTop: isFirst ? 'none' : '1px solid var(--ds-border-soft)',
      alignItems: 'flex-start',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--ds-muted)', paddingTop: 2,
      }}>
        {label}
      </div>
      {isEditing ? (
        <Editor initial={value} multiline={multiline} disabled={disabled} onSave={onSave} onCancel={onCancel} />
      ) : (
        <button
          type="button"
          onClick={onStart}
          disabled={disabled}
          style={{
            background: 'transparent', border: 'none', textAlign: 'left',
            padding: 0, cursor: disabled ? 'default' : 'text',
            color: 'var(--ds-ink)', fontFamily: 'var(--ds-font)',
            fontSize: 14, fontWeight: 500, lineHeight: 1.45, width: '100%',
          }}
        >
          {value || <span style={{ color: 'var(--ds-muted)' }}>{placeholder || 'Заполнить…'}</span>}
        </button>
      )}
    </div>
  )
}

function Editor({
  initial, multiline, disabled, onSave, onCancel,
}: {
  initial: string
  multiline?: boolean
  disabled: boolean
  onSave: (v: string) => void
  onCancel: () => void
}) {
  const [v, setV] = useState(initial)
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
    if (e.key === 'Enter' && !multiline) { e.preventDefault(); onSave(v) }
    if (e.key === 'Enter' && multiline && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave(v) }
  }
  const style: React.CSSProperties = {
    width: '100%',
    fontFamily: 'var(--ds-font)', fontSize: 14,
    color: 'var(--ds-ink)', background: 'var(--ds-bg)',
    border: '1px solid var(--ds-purple)', borderRadius: 'var(--ds-r-sm)',
    padding: '8px 10px', boxShadow: '0 0 0 3px var(--ds-purple-soft)',
    outline: 'none', lineHeight: 1.45, resize: 'vertical',
  }
  return (
    <div>
      {multiline ? (
        <textarea autoFocus value={v} onChange={e => setV(e.target.value)} onKeyDown={handleKey} rows={3} style={style} />
      ) : (
        <input autoFocus type="text" value={v} onChange={e => setV(e.target.value)} onKeyDown={handleKey} style={style} />
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" disabled={disabled} className="ds-btn ds-btn-primary ds-btn-sm" onClick={() => onSave(v)}>
          Сохранить
        </button>
        <button type="button" disabled={disabled} className="ds-btn ds-btn-secondary ds-btn-sm" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  )
}
