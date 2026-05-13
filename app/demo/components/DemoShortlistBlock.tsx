'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { University } from '@/app/client/mock-data'
import { useDemoState } from '../DemoState'

const MAIN_PAGE_LIMIT = 3

interface Props {
  items: University[]
  total: number
}

export function DemoShortlistBlock({ items, total }: Props) {
  const { state, ready } = useDemoState()

  const { shown, selectedCount } = useMemo(() => {
    const all = state.priorityKeys
      .map(k => items.find(u => u.key === k))
      .filter((x): x is University => Boolean(x))
    return { shown: all.slice(0, MAIN_PAGE_LIMIT), selectedCount: all.length }
  }, [items, state.priorityKeys])

  const hasAny = selectedCount > 0
  const moreCount = selectedCount - shown.length

  return (
    <div className="ds-card" style={{ padding: 32 }}>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ds-purple)', marginBottom: 6 }}>
            Подборка от куратора
          </div>
          <h2 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 'clamp(22px, 2.8vw, 30px)', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ds-ink)', margin: 0, lineHeight: 1.05 }}>
            {hasAny ? 'Приоритетные вузы' : 'Выбери приоритетные'}
          </h2>
          <p style={{ fontSize: 14, color: 'var(--ds-muted)', margin: '6px 0 0', maxWidth: 560, letterSpacing: '-0.005em' }}>
            {hasAny
              ? moreCount > 0
                ? `Первые ${shown.length} из ${selectedCount} приоритетных. Всего в подборке — ${total}.`
                : `${selectedCount} ${selectedCount === 1 ? 'приоритетная программа' : 'в приоритете'}. Всего в подборке — ${total}.`
              : `Куратор подготовил ${total} программ. Выбери приоритетные — на главной появятся первые ${MAIN_PAGE_LIMIT}.`}
          </p>
        </div>
        <Link href="/demo/shortlist" className="ds-btn ds-btn-secondary ds-btn-sm" style={{ textDecoration: 'none' }}>
          {hasAny
            ? moreCount > 0
              ? `+ ещё ${moreCount} приоритет${moreCount === 1 ? 'ная' : 'ных'} · все ${total} →`
              : `Все ${total} вузов →`
            : 'Выбрать приоритетные →'}
        </Link>
      </header>

      {(!ready || !hasAny) ? (
        <EmptyState total={total} />
      ) : (
        <div className="demo-shortlist-priority-grid" style={{
          display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, shown.length)}, 1fr)`, gap: 16,
        }}>
          <style>{`
            @media (max-width: 960px) { .demo-shortlist-priority-grid { grid-template-columns: 1fr 1fr !important; } }
            @media (max-width: 600px) { .demo-shortlist-priority-grid { grid-template-columns: 1fr !important; } }
          `}</style>
          {shown.map((uni, idx) => <UniCard key={uni.key} uni={uni} rank={idx + 1} />)}
        </div>
      )}
    </div>
  )
}

function EmptyState({ total }: { total: number }) {
  return (
    <Link href="/demo/shortlist" style={{
      display: 'block', position: 'relative', padding: '40px 32px',
      background: 'linear-gradient(135deg, var(--ds-purple-soft) 0%, rgba(177,94,204,0.04) 100%)',
      border: '1.5px solid var(--ds-purple)', borderRadius: 'var(--ds-r-lg)',
      textDecoration: 'none', color: 'var(--ds-ink)', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 16, right: 16, background: 'var(--ds-purple)', color: '#fff', padding: '4px 10px', borderRadius: 100, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        ✨ Новая
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--ds-purple)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 30, flexShrink: 0, boxShadow: '0 8px 24px -6px rgba(177,94,204,0.5)' }}>
          🎓
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 22, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ds-ink)', marginBottom: 4 }}>
            Подборка готова — {total} программ
          </div>
          <div style={{ fontSize: 14, color: 'var(--ds-ink-dim)', lineHeight: 1.5 }}>
            Куратор подобрал вузы под твой профиль. Открой, изучи и отметь приоритетные — на главной покажем первые {MAIN_PAGE_LIMIT}.
          </div>
        </div>
        <div style={{ flexShrink: 0, padding: '14px 24px', background: 'var(--ds-purple)', color: '#fff', borderRadius: 12, fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
          Открыть →
        </div>
      </div>
    </Link>
  )
}

function UniCard({ uni, rank }: { uni: University; rank: number }) {
  return (
    <Link href={`/demo/universities/${uni.key}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <article style={{
        background: 'var(--ds-bg-alt)',
        border: '1px solid var(--ds-border-soft)',
        borderRadius: 'var(--ds-r-lg)',
        padding: 20,
        display: 'flex', flexDirection: 'column', gap: 14,
        position: 'relative', cursor: 'pointer',
        transition: 'transform 120ms, box-shadow 120ms, border-color 120ms',
      }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 6px 18px -8px rgba(0,0,0,0.12)'
          e.currentTarget.style.borderColor = 'var(--ds-purple)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
          e.currentTarget.style.borderColor = 'var(--ds-border-soft)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--ds-purple-soft)', display: 'grid', placeItems: 'center', fontSize: 22 }}>
              {uni.flag}
            </div>
            <div style={{ fontFamily: 'var(--ds-font-display-stack)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ds-muted)', fontVariantNumeric: 'tabular-nums' }}>
              #{rank}
            </div>
          </div>
          {uni.rank && (
            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1, fontFamily: 'var(--ds-font-display-stack)', color: 'var(--ds-purple-deep)' }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ds-muted)', marginBottom: 4 }}>
                {uni.rank.source}
              </span>
              <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                #{uni.rank.value}
              </span>
            </div>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <h4 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ds-ink)', margin: '0 0 4px 0', lineHeight: 1.2 }}>
            {uni.program}
          </h4>
          <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginBottom: 10 }}>
            {uni.name} · {uni.city} · {uni.country}
          </div>
          {uni.tags && uni.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {uni.tags.map((t, i) => (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', padding: '2px 8px', fontSize: 10, fontWeight: 600, letterSpacing: '0.02em',
                  background: 'var(--ds-purple-soft)', color: 'var(--ds-purple-deep)', borderRadius: 999,
                }}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </article>
    </Link>
  )
}
