'use client'

import Link from 'next/link'
import type { University } from '@/app/client/mock-data'

interface Props {
  items: University[]
  priorities: string[]
}

export function DemoShortlistBlock({ items, priorities }: Props) {
  const top = items.slice(0, 6)

  return (
    <section>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 22, letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0 }}>
            Подборка от куратора
          </h2>
          <p style={{ fontSize: 12, color: 'var(--ds-ink-dim)', marginTop: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {items.length} программ · {priorities.length} в приоритете
          </p>
        </div>
        <Link
          href="/demo/shortlist"
          style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--ds-purple)', textDecoration: 'none',
            border: '1px solid var(--ds-purple)', padding: '8px 16px', borderRadius: 8,
          }}
        >
          Открыть подборку →
        </Link>
      </header>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16,
      }}>
        {top.map((u, idx) => {
          const priorityIdx = priorities.indexOf(u.key)
          const isPriority = priorityIdx >= 0
          return (
            <Link
              key={u.key}
              href={`/demo/universities/${u.key}`}
              style={{
                display: 'block', padding: 16, borderRadius: 12,
                background: 'var(--ds-surface)',
                border: '1px solid ' + (isPriority ? 'var(--ds-purple)' : 'var(--ds-border-soft)'),
                textDecoration: 'none', color: 'inherit',
                position: 'relative',
                transition: 'transform .15s ease, box-shadow .15s ease',
              }}
              className="ds-card-hover"
            >
              {isPriority && (
                <div style={{
                  position: 'absolute', top: -8, right: 12,
                  background: 'var(--ds-purple)', color: '#fff',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                  padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase',
                }}>
                  Приоритет #{priorityIdx + 1}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 22 }}>{u.flag}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ds-ink)', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {u.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ds-ink-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>
                    {u.city} · {u.country}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ds-ink-dim)', lineHeight: 1.45, marginBottom: 10, minHeight: 36 }}>
                {u.program}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--ds-ink-dim)' }}>
                  {u.tuition || '—'}
                </div>
                {u.rank && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                    background: 'rgba(177,94,204,.1)', color: 'var(--ds-purple)',
                    padding: '3px 7px', borderRadius: 4,
                  }}>
                    {u.rank.source} #{u.rank.value}
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </div>

      <style>{`
        .ds-card-hover:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,.06); }
      `}</style>
    </section>
  )
}
