'use client'

import { C, CARD_SHADOW } from '../lib/theme'
import type { ReactNode, CSSProperties } from 'react'

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: CARD_SHADOW, padding: '22px 24px', ...style }}>
      {children}
    </div>
  )
}

export function SectionTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {right && <div style={{ fontSize: 13, color: C.muted }}>{right}</div>}
    </div>
  )
}

export function Kpi({ label, value, valueColor, hint, hintColor, progress, progressColor }: {
  label: string; value: string; valueColor?: string
  hint?: ReactNode; hintColor?: string
  progress?: number; progressColor?: string
}) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: CARD_SHADOW, padding: 20 }}>
      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', color: C.muted, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 38, fontWeight: 600, letterSpacing: '-.03em', lineHeight: 1.05, color: valueColor || C.text, marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {progress !== undefined && (
        <div style={{ height: 6, background: C.track, borderRadius: 3, overflow: 'hidden', margin: '10px 0 8px' }}>
          <div style={{ height: '100%', width: `${Math.min(Math.max(progress, 0), 100)}%`, background: progressColor || C.warn, borderRadius: 3, transition: 'width .4s ease-out' }} />
        </div>
      )}
      {hint !== undefined && <div style={{ fontSize: 13, color: hintColor || C.text3, marginTop: progress !== undefined ? 0 : 8 }}>{hint}</div>}
    </div>
  )
}

export function EmptyState({ title, text }: { title?: string; text?: string }) {
  return (
    <div style={{ border: `1px dashed ${C.ctrlBorder2}`, borderRadius: 12, background: '#faf9f7', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '32px 28px', gap: 12 }}>
      <div style={{ width: 46, height: 46, borderRadius: '50%', border: `2px dashed ${C.neutral}` }} />
      {title && <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{title}</div>}
      <div style={{ fontSize: 13, color: C.muted, maxWidth: 300, lineHeight: 1.5 }}>
        {text || 'Данные появятся по мере накопления истории — примерно через месяц.'}
      </div>
    </div>
  )
}

export function GridCols({ cols, gap = 16, children, style }: { cols: string; gap?: number; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ display: 'grid', gridTemplateColumns: cols, gap, ...style }}>{children}</div>
}
