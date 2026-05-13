'use client'

import Link from 'next/link'
import { DemoTopNav } from '../DemoTopNav'
import { useDemoState, DEMO_UNIVERSITIES } from '../DemoState'

export default function DemoShortlistPage() {
  const { state, ready, togglePriority, movePriority } = useDemoState()
  if (!ready) return null

  const priorityKeys = state.priorityKeys
  const priorityUnis = priorityKeys.map(k => DEMO_UNIVERSITIES.find(u => u.key === k)).filter(Boolean) as typeof DEMO_UNIVERSITIES
  const remainingUnis = DEMO_UNIVERSITIES.filter(u => !priorityKeys.includes(u.key))

  return (
    <>
      <DemoTopNav activePage="shortlist" />

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 32px 80px' }}>
        <header style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 32, letterSpacing: '0.02em', textTransform: 'uppercase', margin: 0 }}>
            Подборка вузов
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ds-ink-dim)', marginTop: 8 }}>
            Куратор подобрал {DEMO_UNIVERSITIES.length} программ под твой профиль. Отметь свои приоритеты — по ним готовятся заявки.
          </p>
        </header>

        {/* Приоритетный блок */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ds-ink-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>
            Твои приоритеты ({priorityUnis.length})
          </h2>
          {priorityUnis.length === 0 ? (
            <div style={{ padding: 24, borderRadius: 12, background: 'var(--ds-surface)', border: '1px dashed var(--ds-border-soft)', textAlign: 'center', color: 'var(--ds-ink-dim)' }}>
              Пока ни одной программы не отмечено. Кликни <b>+ В приоритет</b> на нужной программе ниже.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {priorityUnis.map((u, idx) => (
                <div key={u.key} style={{
                  display: 'grid', gridTemplateColumns: '40px 1fr auto auto', gap: 16, alignItems: 'center',
                  padding: 18, borderRadius: 12, background: 'var(--ds-surface)',
                  border: '1px solid var(--ds-purple)',
                }}>
                  <div style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 32, color: 'var(--ds-purple)', textAlign: 'center' }}>
                    {idx + 1}
                  </div>
                  <Link href={`/demo/universities/${u.key}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 18 }}>{u.flag}</span>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ds-ink)' }}>{u.name}</div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ds-ink-dim)' }}>
                      {u.program} · {u.city}, {u.country}
                    </div>
                  </Link>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <button onClick={() => movePriority(u.key, 'up')} disabled={idx === 0}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--ds-border-soft)', background: '#fff', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.3 : 1, fontSize: 14 }}>↑</button>
                    <button onClick={() => movePriority(u.key, 'down')} disabled={idx === priorityUnis.length - 1}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--ds-border-soft)', background: '#fff', cursor: idx === priorityUnis.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === priorityUnis.length - 1 ? 0.3 : 1, fontSize: 14 }}>↓</button>
                  </div>
                  <button onClick={() => togglePriority(u.key)}
                    style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--ds-red)', background: '#fff', color: 'var(--ds-red)', cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Убрать
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Остальные программы */}
        <section>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ds-ink-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>
            Остальные программы ({remainingUnis.length})
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {remainingUnis.map(u => (
              <div key={u.key} style={{
                padding: 16, borderRadius: 12, background: 'var(--ds-surface)',
                border: '1px solid var(--ds-border-soft)',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <Link href={`/demo/universities/${u.key}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 18 }}>{u.flag}</span>
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--ds-ink)' }}>{u.name}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ds-ink-dim)', lineHeight: 1.4 }}>
                    {u.program}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ds-ink-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>
                    {u.city} · {u.country} · {u.tuition || '—'}
                  </div>
                </Link>
                <button onClick={() => togglePriority(u.key)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ds-purple)', background: '#fff', color: 'var(--ds-purple)', cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  + В приоритет
                </button>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  )
}
