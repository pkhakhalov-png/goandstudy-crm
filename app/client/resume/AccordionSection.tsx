'use client'

import { useState } from 'react'

/* ─────────────────────────────────────────────────────────────────
   AccordionSection — top-level collapsible (Education / Courses / …)
   Имеет drag-handle слева, заголовок, опциональное описание, chevron
   справа. Внутри renders children.
   ───────────────────────────────────────────────────────────────── */

interface AccordionSectionProps {
  title: string
  description?: string
  children: React.ReactNode
  defaultOpen?: boolean
  right?: React.ReactNode
}

export function AccordionSection({
  title, description, children, defaultOpen = true, right,
}: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '22px 24px 20px',
        }}
      >
        <DragDots />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            padding: 0,
            textAlign: 'left',
            cursor: 'pointer',
            fontFamily: 'var(--ds-font)',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--ds-font-display-stack)',
              fontWeight: 700,
              fontSize: 20,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--ds-ink)',
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            {title}
          </h2>
          {description && (
            <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: '6px 0 0', lineHeight: 1.45, letterSpacing: '-0.005em' }}>
              {description}
            </p>
          )}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {right}
          <ChevronButton open={open} onClick={() => setOpen(o => !o)} />
        </div>
      </div>

      <div
        style={{
          maxHeight: open ? 20000 : 0,
          overflow: 'hidden',
          transition: 'max-height 320ms cubic-bezier(0.25, 0.1, 0.25, 1)',
          borderTop: open ? '1px solid var(--ds-border-soft)' : '1px solid transparent',
        }}
      >
        <div style={{ padding: '20px 24px 24px' }}>
          {children}
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────
   SubItem — элемент списка внутри секции
   Collapsed: title + subtitle + chevron.  Click → expanded форма.
   ───────────────────────────────────────────────────────────────── */

interface SubItemProps {
  title: string
  subtitle?: string
  defaultOpen?: boolean
  onRemove?: () => void
  children: React.ReactNode
}

export function SubItem({ title, subtitle, defaultOpen = false, onRemove, children }: SubItemProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div
      style={{
        border: '1px solid var(--ds-border-soft)',
        borderRadius: 'var(--ds-r-md)',
        background: 'var(--ds-bg)',
        transition: 'border-color 120ms, box-shadow 120ms',
        ...(open && { borderColor: 'var(--ds-border)' }),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
        <DragDots small />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            padding: 0,
            textAlign: 'left',
            cursor: 'pointer',
            fontFamily: 'var(--ds-font)',
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ds-ink)', letterSpacing: '-0.01em', lineHeight: 1.3 }}>
            {title || <span style={{ color: 'var(--ds-muted)', fontWeight: 400, fontStyle: 'italic' }}>Новая запись</span>}
          </div>
          {subtitle && (
            <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 2, letterSpacing: '-0.005em' }}>
              {subtitle}
            </div>
          )}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label="Удалить"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--ds-muted)',
                cursor: 'pointer',
                padding: 6,
                fontSize: 13,
                opacity: 0.6,
                transition: 'opacity 120ms, color 120ms',
                borderRadius: 6,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--ds-error)' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.color = 'var(--ds-muted)' }}
            >
              ✕
            </button>
          )}
          <ChevronButton open={open} onClick={() => setOpen(o => !o)} small />
        </div>
      </div>
      <div
        style={{
          maxHeight: open ? 4000 : 0,
          overflow: 'hidden',
          transition: 'max-height 320ms cubic-bezier(0.25, 0.1, 0.25, 1)',
          borderTop: open ? '1px solid var(--ds-border-soft)' : '1px solid transparent',
        }}
      >
        <div style={{ padding: '16px 20px 20px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

/* ─── Shared controls ─── */

function DragDots({ small }: { small?: boolean }) {
  const size = small ? 14 : 16
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size + 6,
        display: 'grid',
        gridTemplateColumns: '2px 2px',
        gridTemplateRows: `repeat(3, 2px)`,
        gap: 3,
        color: 'var(--ds-muted)',
        opacity: 0.4,
        flexShrink: 0,
        marginTop: 4,
        cursor: 'grab',
      }}
    >
      {[...Array(6)].map((_, i) => <span key={i} style={{ width: 2, height: 2, background: 'currentColor', borderRadius: '50%' }} />)}
    </div>
  )
}

function ChevronButton({ open, onClick, small }: { open: boolean; onClick: () => void; small?: boolean }) {
  const size = small ? 26 : 32
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? 'Свернуть' : 'Развернуть'}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: open ? 'var(--ds-purple-soft)' : 'var(--ds-bg-alt)',
        color: open ? 'var(--ds-purple-deep)' : 'var(--ds-ink)',
        border: 'none',
        display: 'grid',
        placeItems: 'center',
        fontSize: small ? 11 : 13,
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 180ms ease-out',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 220ms ease-out',
          lineHeight: 1,
        }}
      >
        ▾
      </span>
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────────
   "Add one more X" button — унифицированный add-cta внизу секции
   ───────────────────────────────────────────────────────────────── */

export function AddMoreButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent',
        border: '1.5px dashed var(--ds-border)',
        color: 'var(--ds-purple)',
        fontFamily: 'var(--ds-font)',
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        padding: '12px 16px',
        borderRadius: 'var(--ds-r-md)',
        cursor: 'pointer',
        width: '100%',
        marginTop: 12,
        transition: 'all 120ms',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--ds-purple)'; e.currentTarget.style.background = 'var(--ds-purple-soft)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--ds-border)'; e.currentTarget.style.background = 'transparent' }}
    >
      + {label}
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────────
   Field — labeled input / textarea
   ───────────────────────────────────────────────────────────────── */

interface FieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
  rows?: number
  width?: 'full' | 'half'
  hint?: React.ReactNode
}

export function Field({ label, value, onChange, placeholder, multiline, rows = 4, width = 'full', hint }: FieldProps) {
  return (
    <div style={{ gridColumn: width === 'full' ? '1 / -1' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
        <label
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--ds-muted)',
          }}
        >
          {label}
        </label>
        {hint}
      </div>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="ds-input"
          style={{ resize: 'vertical', lineHeight: 1.5 }}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="ds-input"
        />
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   SelectField — native select with DS styling
   ───────────────────────────────────────────────────────────────── */

export function SelectField({
  label, value, onChange, options, width = 'full',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  width?: 'full' | 'half'
}) {
  return (
    <div style={{ gridColumn: width === 'full' ? '1 / -1' : undefined }}>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--ds-muted)',
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ds-input"
        style={{ cursor: 'pointer', appearance: 'auto' }}
      >
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  )
}
