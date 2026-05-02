'use client'

import { useState, useTransition } from 'react'
import { saveProjectField, confirmProject } from '@/lib/student-project-actions'
import { STUDENT_PROJECT_FIELDS, type StudentProjectData } from '@/lib/student-project-types'

interface Props {
  clientId: number
  initial: StudentProjectData
  /** true если viewer — клиент (видит кнопку «Подтверждаю»). По умолчанию false. */
  isClient?: boolean
  /** Read-only режим. Если true — редактирование выключено. */
  readOnly?: boolean
}

const FIELDS = STUDENT_PROJECT_FIELDS

export function StudentProjectBlock({ clientId, initial, isClient = false, readOnly = false }: Props) {
  const [data, setData] = useState<StudentProjectData>(initial || {})
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const filledCount = FIELDS.filter(f => (data[f.key] || '').trim().length > 0).length
  const allFilled = filledCount === FIELDS.length
  const isConfirmed = !!data.confirmed_at

  // После подтверждения клиент больше не может редактировать поля.
  // Куратор/админ — могут всегда.
  const fieldsReadOnly = readOnly || (isClient && isConfirmed)

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

  const handleConfirm = () => {
    setErr(null)
    startTransition(async () => {
      const r = await confirmProject({ clientId })
      if (!r.ok) setErr(r.error)
      else setData(d => ({ ...d, confirmed_at: new Date().toISOString() }))
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
        <StatusChip
          isConfirmed={isConfirmed}
          isEmpty={filledCount === 0}
          confirmedAt={data.confirmed_at}
          confirmedBy={data.confirmed_by_name}
        />
      </div>

      <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginBottom: 16 }}>
        {filledCount} / {FIELDS.length} полей заполнено
        {data.updated_at && data.updated_by_name && (
          <> · обновил {data.updated_by_name}, {new Date(data.updated_at).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}</>
        )}
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
            disabled={fieldsReadOnly || pending}
            onStart={() => setEditingKey(f.key)}
            onCancel={() => setEditingKey(null)}
            onSave={(v) => persistField(f.key, v)}
          />
        ))}
      </div>

      {isClient && isConfirmed && (
        <div style={{ padding: '12px', background: 'var(--ds-success-soft)', borderRadius: 'var(--ds-r-md)', border: '1px solid rgba(52,199,89,0.32)', fontSize: 12, color: 'var(--ds-ink)', lineHeight: 1.5, marginBottom: 12 }}>
          Проект подтверждён. Изменения вносит только куратор. Если что-то нужно поправить — напиши ему.
        </div>
      )}

      {/* Кнопка подтверждения для клиента */}
      {isClient && !isConfirmed && allFilled && !readOnly && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '16px', background: 'var(--ds-bg-alt)', borderRadius: 'var(--ds-r-md)', border: '1px dashed var(--ds-border)' }}>
          <div style={{ fontSize: 13, color: 'var(--ds-ink)', fontWeight: 600 }}>
            Куратор зафиксировал твой проект. Проверь поля выше — если всё верно, подтверди.
          </div>
          <div style={{ fontSize: 12, color: 'var(--ds-muted)', lineHeight: 1.5 }}>
            После подтверждения статус сменится на «Зафиксировано». Если что-то нужно поменять — напиши куратору.
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={handleConfirm}
            className="ds-btn ds-btn-primary"
            style={{ alignSelf: 'flex-start', padding: '10px 24px', fontSize: 14, fontWeight: 600 }}
          >
            {pending ? 'Подтверждаем…' : '✓ Подтверждаю'}
          </button>
        </div>
      )}

      {isClient && !isConfirmed && !allFilled && (
        <div style={{ padding: '12px', background: 'var(--ds-bg-alt)', borderRadius: 'var(--ds-r-md)', border: '1px dashed var(--ds-border)', fontSize: 12, color: 'var(--ds-muted)', lineHeight: 1.5 }}>
          Кнопка «Подтверждаю» появится когда куратор заполнит все поля.
        </div>
      )}
    </div>
  )
}

function StatusChip({
  isConfirmed, isEmpty, confirmedAt, confirmedBy,
}: { isConfirmed: boolean; isEmpty: boolean; confirmedAt?: string; confirmedBy?: string }) {
  if (isConfirmed) {
    return (
      <span
        className="ds-chip ds-chip-success"
        style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap' }}
        title={confirmedAt && confirmedBy ? `Подтвердил ${confirmedBy}, ${new Date(confirmedAt).toLocaleDateString('ru')}` : undefined}
      >
        ✓ Зафиксировано
      </span>
    )
  }
  if (isEmpty) {
    return (
      <span className="ds-chip ds-chip-neutral" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10 }}>
        Пусто
      </span>
    )
  }
  return (
    <span className="ds-chip" style={{
      textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10,
      background: '#FEF3C7', color: '#92400E', padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap',
    }}>
      В работе
    </span>
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
