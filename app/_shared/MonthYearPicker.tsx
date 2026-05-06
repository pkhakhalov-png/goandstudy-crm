'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatRoadmapMonth } from '@/lib/roadmap-types'

const MONTHS_RU = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

interface Props {
  value?: string                        // YYYY-MM или ''
  onChange: (value: string) => void     // '' = очистить
  placeholder?: string
  size?: 'sm' | 'md'
  disabled?: boolean
}

export function MonthYearPicker({ value, onChange, placeholder = 'Выбрать дату', size = 'md', disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [yearView, setYearView] = useState<number>(() => {
    const y = (value || '').split('-')[0]
    return y ? Number(y) : new Date().getFullYear()
  })
  const wrapRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null)

  // Закрываем по клику вне триггера и попапа
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

  // Position в координатах document, с clamp к viewport
  useLayoutEffect(() => {
    if (!open) { setPopupPos(null); return }
    function update() {
      const r = wrapRef.current?.getBoundingClientRect()
      if (!r) return
      const POPUP_W = 280
      const POPUP_H = 260
      let left = r.left + window.scrollX
      // Если попап вылезает справа — выравниваем по правому краю триггера
      if (left + POPUP_W > window.scrollX + window.innerWidth - 8) {
        left = r.right + window.scrollX - POPUP_W
      }
      // И никогда не уходим левее экрана
      if (left < window.scrollX + 8) left = window.scrollX + 8
      let top = r.bottom + window.scrollY + 4
      if (top + POPUP_H > window.scrollY + window.innerHeight - 8) {
        // Открываем вверх если снизу не хватает
        top = r.top + window.scrollY - POPUP_H - 4
      }
      setPopupPos({ top, left })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  const selectedYear = (value || '').split('-')[0] || ''
  const selectedMonth = (value || '').split('-')[1] || ''

  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        style={{
          padding: size === 'sm' ? '4px 10px' : '6px 12px',
          fontSize: size === 'sm' ? 12 : 13,
          border: '1px solid var(--ds-border)',
          borderRadius: 6,
          background: 'var(--ds-bg)',
          color: value ? 'var(--ds-ink)' : 'var(--ds-muted)',
          cursor: disabled ? 'default' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 130,
          justifyContent: 'space-between',
        }}
      >
        <span>{value ? formatRoadmapMonth(value) : placeholder}</span>
        <span style={{ fontSize: 11, opacity: 0.6 }}>📅</span>
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
            borderRadius: 8,
            boxShadow: '0 8px 24px -8px rgba(29,29,31,0.18)',
            padding: 12,
            width: 280,
          }}
        >
          {/* Year navigator */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
            paddingBottom: 8,
            borderBottom: '1px solid var(--ds-border-soft)',
          }}>
            <button
              type="button"
              onClick={() => setYearView(y => y - 1)}
              style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ds-purple)', padding: '4px 8px' }}
            >
              ‹
            </button>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ds-ink)' }}>
              {yearView}
            </span>
            <button
              type="button"
              onClick={() => setYearView(y => y + 1)}
              style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--ds-purple)', padding: '4px 8px' }}
            >
              ›
            </button>
          </div>

          {/* Month grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {MONTHS_RU.map((label, idx) => {
              const num = pad(idx + 1)
              const isSelected = selectedYear === String(yearView) && selectedMonth === num
              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => {
                    onChange(`${yearView}-${num}`)
                    setOpen(false)
                  }}
                  style={{
                    padding: '8px 6px',
                    fontSize: 12,
                    border: '1px solid',
                    borderColor: isSelected ? 'var(--ds-purple)' : 'transparent',
                    background: isSelected ? 'var(--ds-purple)' : 'var(--ds-bg-alt)',
                    color: isSelected ? '#fff' : 'var(--ds-ink)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {value && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--ds-border-soft)', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                style={{
                  background: 'transparent', border: 'none',
                  fontSize: 11, color: 'var(--ds-muted)',
                  cursor: 'pointer', textDecoration: 'underline',
                }}
              >
                очистить
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
