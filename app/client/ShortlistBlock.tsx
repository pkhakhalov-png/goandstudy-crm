'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { University } from './mock-data'
import { MAX_PRIORITY } from './mock-data'
import { useClientState } from './shared-store'

interface Props {
  items: University[] // полный список от куратора (15)
  total: number // = items.length по сути, но оставили для явности
}

export function ShortlistBlock({ items, total }: Props) {
  const { state, hydrated } = useClientState()

  const priority = useMemo(() => {
    return state.priorityUniKeys
      .map(k => items.find(u => u.key === k))
      .filter((x): x is University => Boolean(x))
  }, [items, state.priorityUniKeys])

  const selectedCount = priority.length
  const hasAny = selectedCount > 0

  return (
    <div className="ds-card" style={{ padding: 32 }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 24,
          flexWrap: 'wrap',
        }}
      >
        <div>
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
            Подборка от куратора
          </div>
          <h2
            style={{
              fontFamily: 'var(--ds-font-display-stack)',
              fontWeight: 700,
              fontSize: 'clamp(22px, 2.8vw, 30px)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--ds-ink)',
              margin: 0,
              lineHeight: 1.05,
            }}
          >
            {hasAny ? 'Приоритетные вузы' : 'Выбери приоритетные'}
          </h2>
          <p style={{ fontSize: 14, color: 'var(--ds-muted)', margin: '6px 0 0', maxWidth: 560, letterSpacing: '-0.005em' }}>
            {hasAny
              ? `${selectedCount} из ${MAX_PRIORITY} программ выбрано. Всего в подборке — ${total}.`
              : `Куратор подготовил ${total} программ. Отметь ${MAX_PRIORITY} приоритетные — они появятся здесь.`}
          </p>
        </div>
        <Link
          href="/client/shortlist"
          className="ds-btn ds-btn-secondary ds-btn-sm"
          style={{ textDecoration: 'none' }}
        >
          {hasAny ? `Все ${total} вузов →` : `Выбрать приоритетные →`}
        </Link>
      </header>

      {/* ─── Empty state (до гидратации или когда 0 выбрано) ─── */}
      {(!hydrated || !hasAny) ? (
        <EmptyState total={total} />
      ) : (
        <div
          className="shortlist-priority-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.max(1, priority.length)}, 1fr)`,
            gap: 16,
          }}
        >
          <style>{`
            @media (max-width: 960px) { .shortlist-priority-grid { grid-template-columns: 1fr 1fr !important; } }
            @media (max-width: 600px) { .shortlist-priority-grid { grid-template-columns: 1fr !important; } }
          `}</style>
          {priority.map((uni, idx) => (
            <UniCard key={uni.key} uni={uni} rank={idx + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({ total }: { total: number }) {
  return (
    <Link
      href="/client/shortlist"
      style={{
        display: 'grid',
        placeItems: 'center',
        padding: '48px 24px',
        border: '2px dashed var(--ds-border)',
        borderRadius: 'var(--ds-r-lg)',
        textAlign: 'center',
        textDecoration: 'none',
        color: 'var(--ds-ink)',
        gap: 10,
        transition: 'all 150ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--ds-purple)'
        e.currentTarget.style.background = 'var(--ds-purple-soft)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--ds-border)'
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--ds-purple-soft)',
          color: 'var(--ds-purple-deep)',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'var(--ds-font-display-stack)',
          fontSize: 24,
          fontWeight: 700,
        }}
      >
        ★
      </div>
      <div
        style={{
          fontFamily: 'var(--ds-font-display-stack)',
          fontWeight: 700,
          fontSize: 16,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--ds-ink)',
        }}
      >
        Выбрать {MAX_PRIORITY} приоритетные
      </div>
      <div style={{ fontSize: 13, color: 'var(--ds-muted)', maxWidth: 420 }}>
        Куратор уже собрал {total} программ под профиль Игоря. Открой полный список и отметь самые важные.
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--ds-purple)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        Открыть подборку →
      </div>
    </Link>
  )
}

function UniCard({ uni, rank }: { uni: University; rank: number }) {
  return (
    <article
      style={{
        background: 'var(--ds-bg-alt)',
        border: '1px solid var(--ds-border-soft)',
        borderRadius: 'var(--ds-r-lg)',
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 34, lineHeight: 1 }}>{uni.flag}</div>
          <div
            style={{
              fontFamily: 'var(--ds-font-display-stack)',
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--ds-muted)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            #{rank}
          </div>
        </div>
        <div
          style={{
            fontFamily: 'var(--ds-font-display-stack)',
            fontWeight: 700,
            fontSize: 22,
            color: 'var(--ds-purple-deep)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}
        >
          {uni.match}%
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <h4
          style={{
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--ds-ink)',
            margin: '0 0 4px 0',
            lineHeight: 1.2,
          }}
        >
          {uni.name}
        </h4>
        <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginBottom: 10 }}>
          {uni.city} · {uni.country}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--ds-ink)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 8,
          }}
        >
          {uni.program}
        </div>
        <p style={{ fontSize: 13, color: 'var(--ds-ink-dim)', lineHeight: 1.45, margin: 0, letterSpacing: '-0.005em' }}>
          {uni.reason}
        </p>
      </div>

      <Link
        href="/client/shortlist"
        className="ds-btn ds-btn-ghost ds-btn-sm"
        style={{ padding: 0, alignSelf: 'flex-start', textDecoration: 'none' }}
      >
        Подробнее о программе →
      </Link>
    </article>
  )
}
