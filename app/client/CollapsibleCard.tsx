'use client'

import { useState } from 'react'

interface Props {
  eyebrow: string
  title: string
  summary: string
  chip?: React.ReactNode
  initiallyOpen?: boolean
  children: React.ReactNode
}

export function CollapsibleCard({ eyebrow, title, summary, chip, initiallyOpen = false, children }: Props) {
  const [open, setOpen] = useState(initiallyOpen)

  return (
    <div
      className="ds-card"
      style={{
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        height: 'fit-content',
        overflow: 'hidden',
        transition: 'box-shadow 150ms ease-out, border-color 150ms ease-out',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '22px 28px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'var(--ds-font)',
          width: '100%',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--ds-purple)',
              marginBottom: 6,
            }}
          >
            {eyebrow}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h3
              style={{
                fontFamily: 'var(--ds-font-display-stack)',
                fontWeight: 700,
                fontSize: 22,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--ds-ink)',
                margin: 0,
              }}
            >
              {title}
            </h3>
            {chip}
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--ds-muted)',
              marginTop: 6,
              letterSpacing: '-0.005em',
            }}
          >
            {summary}
          </div>
        </div>

        <ChevronIcon open={open} />
      </button>

      <div
        style={{
          maxHeight: open ? 4000 : 0,
          overflow: 'hidden',
          transition: 'max-height 320ms cubic-bezier(0.25, 0.1, 0.25, 1), opacity 220ms ease-out',
          opacity: open ? 1 : 0,
          borderTop: open ? '1px solid var(--ds-border-soft)' : '1px solid transparent',
        }}
      >
        <div style={{ padding: '20px 28px 28px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: open ? 'var(--ds-purple)' : 'var(--ds-bg-alt)',
        color: open ? '#fff' : 'var(--ds-ink)',
        display: 'grid',
        placeItems: 'center',
        fontSize: 14,
        fontWeight: 700,
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
    </div>
  )
}
