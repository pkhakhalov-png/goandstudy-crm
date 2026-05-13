'use client'

/**
 * Resume.io-стайл date picker для образования / работы:
 *   — month grid с year-навигацией (как на скрине)
 *   — для end date: тогл «Currently study/work here» → 'Present'
 *
 * Хранит значение строкой "MMM YYYY" (e.g. "Feb 2022") или "Present".
 * Бэквард-совместим: если value неузнаваем — показывает as-is.
 */

import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface Props {
  value: string
  onChange: (value: string) => void
  /** Если true, показывать тогл «Currently study/work here» (для end-date). */
  presentToggle?: boolean
  presentLabel?: string
  placeholder?: string
}

function parseValue(v: string): { year: number | null; monthIdx: number | null; isPresent: boolean } {
  if (!v) return { year: null, monthIdx: null, isPresent: false }
  if (v.trim().toLowerCase() === 'present') return { year: null, monthIdx: null, isPresent: true }
  // "MMM YYYY"
  const m = v.trim().match(/^([A-Za-z]{3,9})\s*,?\s*(\d{4})$/)
  if (m) {
    const monthIdx = MONTHS_EN.findIndex(mm => mm.toLowerCase() === m[1].slice(0, 3).toLowerCase())
    return { year: parseInt(m[2], 10), monthIdx: monthIdx >= 0 ? monthIdx : null, isPresent: false }
  }
  // "YYYY" — год без месяца
  const y = v.trim().match(/^(\d{4})$/)
  if (y) return { year: parseInt(y[1], 10), monthIdx: null, isPresent: false }
  return { year: null, monthIdx: null, isPresent: false }
}

export function ResumeDatePicker({ value, onChange, presentToggle, presentLabel = 'Currently here', placeholder = 'Select date' }: Props) {
  const [open, setOpen] = useState(false)
  const parsed = parseValue(value)
  const [yearView, setYearView] = useState<number>(parsed.year || new Date().getFullYear())
  const wrapRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null)

  // Закрываем по клику вне попапа/триггера
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || popupRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // Расчёт позиции попапа в координатах document (для portal)
  useLayoutEffect(() => {
    if (!open) { setPopupPos(null); return }
    function update() {
      const r = wrapRef.current?.getBoundingClientRect()
      if (!r) return
      setPopupPos({ top: r.bottom + window.scrollY + 6, left: r.left + window.scrollX })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  const display = parsed.isPresent
    ? 'Present'
    : parsed.year && parsed.monthIdx !== null
      ? `${MONTHS_EN[parsed.monthIdx]} ${parsed.year}`
      : parsed.year
        ? String(parsed.year)
        : (value || '')

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          padding: '10px 12px',
          border: '1px solid var(--ds-border)',
          borderRadius: 8,
          background: 'var(--ds-bg)',
          fontSize: 14,
          fontFamily: 'inherit',
          color: display ? 'var(--ds-ink)' : 'var(--ds-muted)',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>{display || placeholder}</span>
        <span style={{ fontSize: 12, opacity: 0.5 }}>📅</span>
      </button>

      {open && popupPos && typeof document !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          style={{
            position: 'absolute',
            top: popupPos.top,
            left: popupPos.left,
            zIndex: 9999,
            background: '#fff',
            border: '1px solid var(--ds-border)',
            borderRadius: 12,
            boxShadow: '0 12px 40px -10px rgba(29,29,31,0.18)',
            padding: 16,
            width: 280,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <button
              type="button"
              onClick={() => setYearView(y => y - 1)}
              style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ds-ink-dim)', padding: '4px 8px' }}
            >‹</button>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ds-ink)' }}>{yearView}</span>
            <button
              type="button"
              onClick={() => setYearView(y => y + 1)}
              style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ds-ink-dim)', padding: '4px 8px' }}
            >›</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {MONTHS_EN.map((label, idx) => {
              const isSelected = !parsed.isPresent && parsed.year === yearView && parsed.monthIdx === idx
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    onChange(`${label} ${yearView}`)
                    setOpen(false)
                  }}
                  style={{
                    padding: '10px 0',
                    fontSize: 13,
                    border: 'none',
                    background: isSelected ? '#0071E3' : 'transparent',
                    color: isSelected ? '#fff' : 'var(--ds-ink)',
                    borderRadius: 100,
                    cursor: 'pointer',
                    fontWeight: isSelected ? 600 : 400,
                    transition: 'all 100ms',
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--ds-bg-alt)' }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {presentToggle && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--ds-border-soft)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                role="switch"
                aria-checked={parsed.isPresent}
                onClick={() => {
                  onChange(parsed.isPresent ? '' : 'Present')
                  if (!parsed.isPresent) setOpen(false)
                }}
                style={{
                  width: 36, height: 20, borderRadius: 100,
                  background: parsed.isPresent ? '#0071E3' : 'var(--ds-border)',
                  border: 'none', cursor: 'pointer',
                  position: 'relative',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <div style={{
                  position: 'absolute', top: 2, left: parsed.isPresent ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transition: 'left 150ms',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </button>
              <span style={{ fontSize: 13, color: 'var(--ds-ink)' }}>{presentLabel}</span>
            </div>
          )}

          {value && !presentToggle && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--ds-border-soft)', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                style={{
                  background: 'transparent', border: 'none',
                  fontSize: 12, color: 'var(--ds-muted)',
                  cursor: 'pointer', textDecoration: 'underline',
                }}
              >clear</button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
