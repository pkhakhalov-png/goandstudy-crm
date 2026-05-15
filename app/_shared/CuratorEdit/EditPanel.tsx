'use client'

/**
 * Бок-панель редактирования карточки. Когда канает (EditMode.enabled) —
 * выезжает справа с формой всех editable-полей сущности.
 *
 * Преимущество: одна точка правки вместо обвязки каждого InfoRow inline.
 * После blur — сохраняем через onSave(field, value).
 */

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useEditMode } from './EditMode'
import { OverrideBadge } from './EditMode'
import type { OverrideMeta } from '@/lib/curator-overrides'

export type EditableFieldSpec = {
  field: string
  label: string
  /** Текущее значение */
  value: string
  /** Уже переопределено куратором */
  isOverridden: boolean
  by?: OverrideMeta
  /** Подсказка под полем (например «AI fill даст значение если очистить») */
  hint?: string
  /** Тип ввода */
  type?: 'text' | 'textarea' | 'number' | 'date'
  placeholder?: string
}

export type EditableSection = {
  title: string
  fields: EditableFieldSpec[]
}

interface Props {
  title: string
  sections: EditableSection[]
  onSave: (field: string, value: string | null) => Promise<{ ok: true } | { ok: false; error: string }>
}

export function EditPanel({ title, sections, onSave }: Props) {
  const router = useRouter()
  const { enabled, setEnabled } = useEditMode()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [savedFields, setSavedFields] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Init drafts from values
  useEffect(() => {
    if (!enabled) return
    const init: Record<string, string> = {}
    for (const sec of sections) for (const f of sec.fields) init[f.field] = f.value || ''
    setDrafts(init)
  }, [enabled, sections])

  if (!enabled) return null

  function setDraft(field: string, v: string) {
    setDrafts(d => ({ ...d, [field]: v }))
    setErrors(e => { const next = { ...e }; delete next[field]; return next })
  }

  async function commit(field: string) {
    const v = drafts[field] ?? ''
    const trimmed = v.trim()
    const original = sections.flatMap(s => s.fields).find(f => f.field === field)?.value || ''
    if (trimmed === original) return // ничего не изменилось

    setSaving(s => new Set(s).add(field))
    const next = trimmed === '' ? null : trimmed
    const res = await onSave(field, next)
    setSaving(s => { const n = new Set(s); n.delete(field); return n })
    if (res.ok) {
      setSavedFields(s => new Set(s).add(field))
      setTimeout(() => setSavedFields(s => { const n = new Set(s); n.delete(field); return n }), 1500)
      router.refresh()  // обновляем серверную страницу чтобы applyOverrides подхватил новое значение
    } else {
      setErrors(e => ({ ...e, [field]: res.error }))
    }
  }

  async function reset(field: string) {
    setSaving(s => new Set(s).add(field))
    const res = await onSave(field, null)
    setSaving(s => { const n = new Set(s); n.delete(field); return n })
    if (res.ok) {
      setDrafts(d => ({ ...d, [field]: '' }))
      router.refresh()
    } else {
      setErrors(e => ({ ...e, [field]: res.error }))
    }
  }

  return (
    <>
      <style>{`@keyframes slide-in-right { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
      <div
        role="dialog"
        aria-modal="false"
        style={{
          position: 'fixed', top: 60, right: 0, bottom: 0,
          width: 480, maxWidth: '100vw',
          background: 'var(--bg, #fff)',
          borderLeft: '1px solid var(--bor, #e5e5e7)',
          boxShadow: '-12px 0 32px -8px rgba(0,0,0,0.12)',
          overflowY: 'auto',
          zIndex: 40,
          animation: 'slide-in-right 220ms cubic-bezier(0.25, 0.1, 0.25, 1)',
        }}
      >
        {/* Header */}
        <div style={{
          position: 'sticky', top: 0, background: 'var(--bg, #fff)',
          padding: '18px 24px', borderBottom: '1px solid var(--bor, #e5e5e7)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, zIndex: 2,
        }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--purple, #B15ECC)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Режим редактирования
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text, #1D1D1F)', marginTop: 2 }}>
              {title}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(false)}
            style={{
              padding: '6px 14px', borderRadius: 8,
              background: 'var(--purple, #B15ECC)', color: '#fff',
              border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
            }}
          >
            ✓ Готово
          </button>
        </div>

        {/* Sections */}
        <div style={{ padding: '20px 24px 80px' }}>
          {sections.map(section => (
            <div key={section.title} style={{ marginBottom: 32 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--muted, #86868B)',
                marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--bor-soft, #efefef)',
              }}>
                {section.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {section.fields.map(f => (
                  <FieldRow
                    key={f.field}
                    spec={f}
                    draft={drafts[f.field] ?? ''}
                    onChange={(v) => setDraft(f.field, v)}
                    onBlur={() => commit(f.field)}
                    onReset={() => reset(f.field)}
                    saving={saving.has(f.field)}
                    savedJustNow={savedFields.has(f.field)}
                    error={errors[f.field]}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function FieldRow({ spec, draft, onChange, onBlur, onReset, saving, savedJustNow, error }: {
  spec: EditableFieldSpec
  draft: string
  onChange: (v: string) => void
  onBlur: () => void
  onReset: () => void
  saving: boolean
  savedJustNow: boolean
  error?: string
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 8,
    border: '1.5px solid ' + (spec.isOverridden ? 'rgba(232,184,68,.5)' : 'var(--bor, #e5e5e7)'),
    background: spec.isOverridden ? 'rgba(232,184,68,.04)' : '#fff',
    fontSize: 13,
    lineHeight: 1.5,
    fontFamily: 'inherit',
    color: 'var(--text, #1D1D1F)',
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted, #86868B)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {spec.label}
        </span>
        {spec.isOverridden && <OverrideBadge by={spec.by?.by_name} at={spec.by?.at} />}
        {saving && <span style={{ fontSize: 10, color: 'var(--muted, #86868B)' }}>сохраняем…</span>}
        {savedJustNow && <span style={{ fontSize: 10, color: 'var(--green, #1D7A35)' }}>✓ сохранено</span>}
        {spec.isOverridden && !saving && (
          <button
            type="button"
            onClick={onReset}
            title="Вернуть значение от AI / парсера"
            style={{
              marginLeft: 'auto', fontSize: 10, padding: '2px 8px', borderRadius: 4,
              background: 'rgba(255,59,48,.06)', color: '#C92D22',
              border: '1px solid rgba(255,59,48,.18)', cursor: 'pointer',
              fontFamily: 'inherit', letterSpacing: '0.04em',
            }}
          >
            ↺ сбросить
          </button>
        )}
      </label>
      {spec.type === 'textarea' ? (
        <MarkdownTextarea
          value={draft}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={spec.placeholder}
          disabled={saving}
          style={inputStyle}
        />
      ) : (
        <input
          type={spec.type === 'number' ? 'number' : spec.type === 'date' ? 'date' : 'text'}
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={spec.placeholder}
          disabled={saving}
          style={inputStyle}
        />
      )}
      {spec.hint && <div style={{ fontSize: 10, color: 'var(--muted, #86868B)', marginTop: 4 }}>{spec.hint}</div>}
      {error && <div style={{ fontSize: 11, color: '#C92D22', marginTop: 4 }}>Ошибка: {error}</div>}
    </div>
  )
}

/* ─── Markdown textarea с мини-тулбаром (жирный / заголовки / списки) ─── */

function MarkdownTextarea({ value, onChange, onBlur, placeholder, disabled, style }: {
  value: string
  onChange: (v: string) => void
  onBlur: () => void
  placeholder?: string
  disabled: boolean
  style: React.CSSProperties
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function wrap(before: string, after = '') {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const sel = value.slice(start, end)
    const next = value.slice(0, start) + before + sel + after + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = start + before.length
      ta.selectionEnd = end + before.length
    })
  }

  function prefixLines(prefix: string) {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const before = value.slice(0, lineStart)
    const region = value.slice(lineStart, end)
    const replaced = region.split('\n').map(line => line.startsWith(prefix) ? line : prefix + line).join('\n')
    const next = before + replaced + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = start + prefix.length
      ta.selectionEnd = end + (replaced.length - region.length)
    })
  }

  return (
    <div>
      <div style={{
        display: 'flex', gap: 4, flexWrap: 'wrap',
        padding: '4px 6px', borderRadius: '8px 8px 0 0',
        background: 'var(--bg-alt, #F5F5F7)',
        borderTop: '1px solid var(--bor, #E5E5E7)',
        borderLeft: '1px solid var(--bor, #E5E5E7)',
        borderRight: '1px solid var(--bor, #E5E5E7)',
      }}>
        <ToolbarBtn onClick={() => prefixLines('## ')} title="Заголовок H2 (отобразится в фирменном стиле)">H₂</ToolbarBtn>
        <ToolbarBtn onClick={() => prefixLines('### ')} title="Заголовок H3">H₃</ToolbarBtn>
        <ToolbarBtn onClick={() => wrap('**', '**')} title="Жирный"><b>B</b></ToolbarBtn>
        <ToolbarBtn onClick={() => wrap('*', '*')} title="Курсив"><i>I</i></ToolbarBtn>
        <ToolbarBtn onClick={() => prefixLines('- ')} title="Список">•</ToolbarBtn>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted, #86868B)', padding: '4px 8px' }}>
          ## Заголовок · **жирный** · - список
        </span>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        rows={Math.min(20, Math.max(6, value.split('\n').length + 1))}
        placeholder={placeholder}
        disabled={disabled}
        style={{ ...style, borderRadius: '0 0 8px 8px', borderTop: 'none', resize: 'vertical' }}
      />
    </div>
  )
}

function ToolbarBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}  // не теряем фокус textarea
      onClick={onClick}
      title={title}
      style={{
        background: '#fff', border: '1px solid var(--bor, #E5E5E7)',
        borderRadius: 6, padding: '4px 10px', fontSize: 13, cursor: 'pointer',
        fontFamily: 'inherit', color: 'var(--text, #1D1D1F)', fontWeight: 600,
        minWidth: 32, lineHeight: 1.2,
      }}
    >
      {children}
    </button>
  )
}
