'use client'

import { useEffect, useRef, useState } from 'react'
import type { StudentProject, StudentProjectField } from './mock-data'
import { CollapsibleCard } from './CollapsibleCard'

interface Props {
  initial: StudentProject
}

export function ProjectStudentCard({ initial }: Props) {
  const [project, setProject] = useState<StudentProject>(initial)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [noteEditing, setNoteEditing] = useState(false)

  function saveField(key: string, value: string) {
    setProject(p => ({
      ...p,
      fields: p.fields.map(f => f.key === key ? { ...f, value } : f),
    }))
    setEditingKey(null)
  }

  function saveNote(value: string) {
    setProject(p => ({ ...p, note: value }))
    setNoteEditing(false)
  }

  const filledCount = project.fields.filter(f => f.value.trim().length > 0).length

  return (
    <CollapsibleCard
      eyebrow="Стратегическая сессия"
      title="Проект студента"
      summary={`${filledCount} / ${project.fields.length} полей заполнено · обновил ${project.updatedBy.replace(/^Куратор\s+/, '')}, ${project.updatedAt}`}
      chip={
        <span className="ds-chip ds-chip-success" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 10 }}>
          ✓ зафиксирован
        </span>
      }
    >
      {/* Structured fields — definition-list style */}
      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 20 }}>
        {project.fields.map((field, idx) => (
          <FieldRow
            key={field.key}
            field={field}
            isFirst={idx === 0}
            isEditing={editingKey === field.key}
            onStartEdit={() => setEditingKey(field.key)}
            onCancel={() => setEditingKey(null)}
            onSave={(v) => saveField(field.key, v)}
          />
        ))}
      </div>

      {/* Free-form note block */}
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--ds-muted)',
            marginBottom: 8,
          }}
        >
          Заметка куратора
        </div>
        {noteEditing ? (
          <NoteEditor
            initialValue={project.note}
            onSave={saveNote}
            onCancel={() => setNoteEditing(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setNoteEditing(true)}
            style={{
              background: 'var(--ds-bg-alt)',
              border: '1px solid var(--ds-border-soft)',
              borderRadius: 'var(--ds-r-md)',
              padding: '14px 16px',
              fontSize: 13,
              lineHeight: 1.55,
              color: 'var(--ds-ink)',
              letterSpacing: '-0.005em',
              textAlign: 'left',
              fontFamily: 'var(--ds-font)',
              cursor: 'text',
              width: '100%',
              transition: 'border-color 120ms',
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--ds-border)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--ds-border-soft)'}
          >
            {project.note || <span style={{ color: 'var(--ds-muted)' }}>Добавить заметку…</span>}
          </button>
        )}
      </div>
    </CollapsibleCard>
  )
}

/* ─── Field row ────────────────────────────────────────────────── */

function FieldRow({
  field, isFirst, isEditing, onStartEdit, onCancel, onSave,
}: {
  field: StudentProjectField
  isFirst: boolean
  isEditing: boolean
  onStartEdit: () => void
  onCancel: () => void
  onSave: (value: string) => void
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr auto',
        gap: 12,
        alignItems: 'flex-start',
        padding: '12px 0',
        borderTop: isFirst ? 'none' : '1px solid var(--ds-border-soft)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ds-muted)',
          paddingTop: 2,
        }}
      >
        {field.label}
      </div>

      {isEditing ? (
        <FieldEditor
          initialValue={field.value}
          multiline={field.multiline}
          onSave={onSave}
          onCancel={onCancel}
        />
      ) : (
        <>
          <button
            type="button"
            onClick={onStartEdit}
            style={{
              background: 'transparent',
              border: 'none',
              textAlign: 'left',
              padding: 0,
              margin: 0,
              cursor: 'text',
              color: 'var(--ds-ink)',
              fontFamily: 'var(--ds-font)',
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: '-0.005em',
              lineHeight: 1.45,
              width: '100%',
            }}
          >
            {field.value || <span style={{ color: 'var(--ds-muted)' }}>Заполнить…</span>}
          </button>
          <button
            type="button"
            onClick={onStartEdit}
            aria-label={`Изменить ${field.label}`}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--ds-muted)',
              cursor: 'pointer',
              padding: 4,
              fontSize: 12,
              opacity: 0.6,
              transition: 'opacity 120ms, color 120ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--ds-purple)' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.color = 'var(--ds-muted)' }}
          >
            ✎
          </button>
        </>
      )}
    </div>
  )
}

function FieldEditor({
  initialValue, multiline, onSave, onCancel,
}: {
  initialValue: string
  multiline?: boolean
  onSave: (v: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initialValue)
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
    if (e.key === 'Enter' && !multiline) { e.preventDefault(); onSave(value) }
    if (e.key === 'Enter' && multiline && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave(value) }
  }

  const commonStyle: React.CSSProperties = {
    width: '100%',
    fontFamily: 'var(--ds-font)',
    fontSize: 14,
    color: 'var(--ds-ink)',
    background: 'var(--ds-bg)',
    border: '1px solid var(--ds-purple)',
    borderRadius: 'var(--ds-r-sm)',
    padding: '8px 10px',
    boxShadow: '0 0 0 3px var(--ds-purple-soft)',
    outline: 'none',
    letterSpacing: '-0.005em',
    lineHeight: 1.45,
    resize: 'vertical',
  }

  return (
    <div style={{ gridColumn: '2 / 4' }}>
      {multiline ? (
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          rows={3}
          style={commonStyle}
        />
      ) : (
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          style={commonStyle}
        />
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <button type="button" className="ds-btn ds-btn-primary ds-btn-sm" onClick={() => onSave(value)}>
          Сохранить
        </button>
        <button type="button" className="ds-btn ds-btn-secondary ds-btn-sm" onClick={onCancel}>
          Отмена
        </button>
        <span style={{ fontSize: 11, color: 'var(--ds-muted)', marginLeft: 4 }}>
          {multiline ? 'Esc — отмена · Cmd+Enter — сохранить' : 'Esc — отмена · Enter — сохранить'}
        </span>
      </div>
    </div>
  )
}

/* ─── Note editor ───────────────────────────────────────────────── */

function NoteEditor({
  initialValue, onSave, onCancel,
}: {
  initialValue: string
  onSave: (v: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initialValue)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave(value) }
  }

  return (
    <div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        rows={4}
        style={{
          width: '100%',
          fontFamily: 'var(--ds-font)',
          fontSize: 13,
          color: 'var(--ds-ink)',
          background: 'var(--ds-bg)',
          border: '1px solid var(--ds-purple)',
          borderRadius: 'var(--ds-r-md)',
          padding: '12px 14px',
          boxShadow: '0 0 0 3px var(--ds-purple-soft)',
          outline: 'none',
          letterSpacing: '-0.005em',
          lineHeight: 1.55,
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <button type="button" className="ds-btn ds-btn-primary ds-btn-sm" onClick={() => onSave(value)}>
          Сохранить
        </button>
        <button type="button" className="ds-btn ds-btn-secondary ds-btn-sm" onClick={onCancel}>
          Отмена
        </button>
        <span style={{ fontSize: 11, color: 'var(--ds-muted)', marginLeft: 4 }}>
          Esc — отмена · Cmd+Enter — сохранить
        </span>
      </div>
    </div>
  )
}
