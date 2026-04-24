'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { University } from './mock-data'
import { MAIN_PAGE_PRIORITY_LIMIT } from './mock-data'
import { useClientState } from './shared-store'

interface Props {
  items: University[] // полный список от куратора (15)
  total: number
}

export function ShortlistBlock({ items, total }: Props) {
  const { state, hydrated } = useClientState()

  const { shown, selectedCount } = useMemo(() => {
    const all = state.priorityUniKeys
      .map(k => items.find(u => u.key === k))
      .filter((x): x is University => Boolean(x))
    return {
      shown: all.slice(0, MAIN_PAGE_PRIORITY_LIMIT),
      selectedCount: all.length,
    }
  }, [items, state.priorityUniKeys])

  const hasAny = selectedCount > 0
  const moreCount = selectedCount - shown.length

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
              ? moreCount > 0
                ? `Первые ${shown.length} из ${selectedCount} приоритетных. Всего в подборке — ${total}.`
                : `${selectedCount} ${selectedCount === 1 ? 'приоритетная программа' : 'в приоритете'}. Всего в подборке — ${total}.`
              : `Куратор подготовил ${total} программ. Выбери приоритетные — на главной появятся первые ${MAIN_PAGE_PRIORITY_LIMIT}.`}
          </p>
        </div>
        <Link
          href="/client/shortlist"
          className="ds-btn ds-btn-secondary ds-btn-sm"
          style={{ textDecoration: 'none' }}
        >
          {hasAny
            ? moreCount > 0
              ? `+ ещё ${moreCount} приоритет${moreCount === 1 ? 'ная' : 'ных'} · все ${total} →`
              : `Все ${total} вузов →`
            : `Выбрать приоритетные →`}
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
            gridTemplateColumns: `repeat(${Math.max(1, shown.length)}, 1fr)`,
            gap: 16,
          }}
        >
          <style>{`
            @media (max-width: 960px) { .shortlist-priority-grid { grid-template-columns: 1fr 1fr !important; } }
            @media (max-width: 600px) { .shortlist-priority-grid { grid-template-columns: 1fr !important; } }
          `}</style>
          {shown.map((uni, idx) => (
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
        Выбрать приоритетные
      </div>
      <div style={{ fontSize: 13, color: 'var(--ds-muted)', maxWidth: 420 }}>
        Куратор собрал {total} программ под профиль Игоря. Отметь сколько угодно — на главной покажутся первые {MAIN_PAGE_PRIORITY_LIMIT}.
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
  const programHref = uni.programId ? `/curator/programs/${uni.programId}` : '/client/shortlist'
  const schoolHref = uni.schoolId ? `/curator/universities/${uni.schoolId}` : null

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
          <UniLogo uni={uni} size={44} />
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
          {schoolHref ? (
            <Link href={schoolHref} style={{ textDecoration: 'none', color: 'inherit' }} className="ds-link-hover">
              {uni.name}
            </Link>
          ) : uni.name}
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
          {uni.programId ? (
            <Link href={programHref} style={{ textDecoration: 'none', color: 'inherit' }} className="ds-link-hover">
              {uni.program}
            </Link>
          ) : uni.program}
        </div>
        <p style={{ fontSize: 13, color: 'var(--ds-ink-dim)', lineHeight: 1.45, margin: 0, letterSpacing: '-0.005em' }}>
          {uni.reason}
        </p>
      </div>
    </article>
  )
}

function UniLogo({ uni, size = 44 }: { uni: University; size?: number }) {
  if (uni.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={uni.logoUrl}
        alt={uni.name}
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          objectFit: 'contain',
          background: '#fff',
          border: '1px solid var(--ds-border-soft)',
          flexShrink: 0,
        }}
      />
    )
  }
  const letter = (uni.name || '?').trim()[0]?.toUpperCase() || '?'
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        flexShrink: 0,
        background: 'var(--ds-purple-soft)',
        color: 'var(--ds-purple-deep)',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'var(--ds-font-display-stack)',
        fontSize: size * 0.4,
        fontWeight: 700,
        border: '1px solid var(--ds-border-soft)',
      }}
    >
      {letter}
    </div>
  )
}
