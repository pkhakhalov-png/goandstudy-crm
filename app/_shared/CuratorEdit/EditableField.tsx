'use client'

/**
 * Универсальное editable-поле для куратор-страниц.
 *
 * В режиме отображения: рендерит {fallback render} + (опционально) бейдж OverrideBadge.
 * В режиме редактирования: textarea/input с auto-save на blur.
 *
 * Save-функция передаётся пропом — у каждой сущности (школа/программа/стипендия) она своя.
 */

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { useEditMode, OverrideBadge } from './EditMode'
import type { OverrideMeta } from '@/lib/curator-overrides'

type SaveFn = (value: string | null) => Promise<{ ok: true } | { ok: false; error: string }>

interface Props {
  value: string
  isOverridden: boolean
  by?: OverrideMeta
  field: string
  onSave: SaveFn
  /** multiline → textarea, иначе input */
  multiline?: boolean
  /** placeholder если value пустой */
  placeholder?: string
  /** Кастомный рендер read-only режима (например с форматированием) — не обязателен */
  renderDisplay?: (value: string) => ReactNode
  /** Дополнительный стиль обёртки */
  style?: React.CSSProperties
  /** type для input — text|number|date */
  inputType?: 'text' | 'number' | 'date'
}

export function EditableField({
  value, isOverridden, by, field, onSave,
  multiline = false, placeholder, renderDisplay, style, inputType = 'text',
}: Props) {
  const { enabled, canEdit } = useEditMode()
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [savedJustNow, setSavedJustNow] = useState(false)
  const initialRef = useRef(value)

  // Sync external changes (e.g., after revalidatePath)
  useEffect(() => { setDraft(value); initialRef.current = value }, [value])

  async function commit() {
    if (draft === initialRef.current) return
    setBusy(true); setErr(null)
    const trimmed = draft.trim()
    const next = trimmed === '' ? null : trimmed
    const res = await onSave(next)
    setBusy(false)
    if (res.ok) {
      initialRef.current = draft
      setSavedJustNow(true)
      setTimeout(() => setSavedJustNow(false), 1500)
    } else {
      setErr(res.error)
    }
  }

  async function clear() {
    setBusy(true); setErr(null)
    const res = await onSave(null)
    setBusy(false)
    if (res.ok) {
      setDraft('')
      initialRef.current = ''
    } else {
      setErr(res.error)
    }
  }

  if (!enabled) {
    // Read-only режим: рендерим значение + бейдж (бейдж сам прячется для не-staff)
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', ...style }}>
        <span>{renderDisplay ? renderDisplay(value) : value || (canEdit ? <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>{placeholder || '—'}</span> : '')}</span>
        {isOverridden && <OverrideBadge by={by?.by_name} at={by?.at} />}
      </span>
    )
  }

  // Edit режим
  const commonStyle: React.CSSProperties = {
    fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5,
    border: '1.5px solid var(--ds-purple, #B15ECC)',
    borderRadius: 8,
    padding: '8px 12px',
    width: '100%',
    background: '#fff', color: 'var(--ds-ink, #1D1D1F)',
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ds-purple, #B15ECC)' }}>
          {field}
        </span>
        {isOverridden && <OverrideBadge by={by?.by_name} at={by?.at} />}
        {busy && <span style={{ fontSize: 10, color: 'var(--muted, #888)' }}>сохраняем…</span>}
        {savedJustNow && <span style={{ fontSize: 10, color: 'var(--ds-success-ink, #1D7A35)' }}>✓ сохранено</span>}
        {isOverridden && !busy && (
          <button
            type="button"
            onClick={clear}
            style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 4,
              background: 'rgba(255,59,48,.08)', color: '#C92D22',
              border: '1px solid rgba(255,59,48,.2)', cursor: 'pointer',
              fontFamily: 'inherit', letterSpacing: '0.04em',
            }}
            title="Сбросить — вернётся значение от AI-fill / парсера"
          >
            ↺ сбросить
          </button>
        )}
      </div>
      {multiline ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          placeholder={placeholder}
          rows={Math.min(12, Math.max(3, draft.split('\n').length))}
          style={{ ...commonStyle, resize: 'vertical' }}
          disabled={busy}
        />
      ) : (
        <input
          type={inputType}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          placeholder={placeholder}
          style={commonStyle}
          disabled={busy}
        />
      )}
      {err && (
        <div style={{ fontSize: 11, color: '#C92D22', padding: '4px 0' }}>
          Ошибка: {err}
        </div>
      )}
    </div>
  )
}
