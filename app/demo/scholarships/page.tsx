'use client'

import Link from 'next/link'
import { DemoTopNav } from '../DemoTopNav'
import { DEMO_SCHOLARSHIPS_FULL } from '../data'

function fmtDate(d: string | null) {
  if (!d) return null
  try {
    return new Date(d).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return d }
}

function daysLeft(d: string | null): number | null {
  if (!d) return null
  const ms = new Date(d).getTime() - Date.now()
  if (!Number.isFinite(ms)) return null
  return Math.ceil(ms / (24 * 3600 * 1000))
}

export default function DemoScholarshipsPage() {
  const scholarships = DEMO_SCHOLARSHIPS_FULL

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg)' }}>
      <DemoTopNav activePage="scholarships" />

      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--ds-border-soft)', background: 'var(--ds-bg)' }}>
        <div aria-hidden style={{ position: 'absolute', top: '-30%', left: '-10%', width: 1000, height: 600, background: 'radial-gradient(ellipse at center, rgba(181,127,207,0.18) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div aria-hidden style={{ position: 'absolute', top: '-20%', right: '-10%', width: 700, height: 400, background: 'radial-gradient(ellipse at center, rgba(232,184,68,0.12) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '40px 32px 28px' }}>
          <Link href="/demo" style={{ fontSize: 12, color: 'var(--ds-purple)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            ← Вернуться в кабинет
          </Link>
          <h1 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '0.02em', lineHeight: 1, margin: '0 0 12px 0', textTransform: 'uppercase' }}>
            Доступные <span className="ds-hl">стипендии</span>
          </h1>
          <p style={{ fontSize: 16, color: 'var(--ds-ink-dim)', maxWidth: 720, lineHeight: 1.5, margin: 0, letterSpacing: '-0.005em' }}>
            Куратор отобрал <b>{scholarships.length}</b> стипенди{scholarships.length === 1 ? 'ю' : 'й'} под твой проект. Жми на любую — увидишь детали.
          </p>
        </div>
      </section>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 32px 80px' }}>
        <div style={{ display: 'grid', gap: 12 }}>
          {scholarships.map(s => {
            const dl = daysLeft(s.deadline)
            return (
              <article
                key={s.id}
                style={{
                  background: 'var(--ds-bg)', border: '1px solid var(--ds-border-soft)',
                  borderRadius: 'var(--ds-r-lg)', padding: 24,
                  borderLeft: '3px solid #0088cc',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0088cc', background: 'rgba(0,136,204,.10)', padding: '3px 8px', borderRadius: 4 }}>
                        IDP
                      </span>
                      {dl !== null && dl >= 0 && dl <= 30 && (
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ds-error-ink)', background: 'rgba(220,53,69,.10)', padding: '3px 8px', borderRadius: 4 }}>
                          до дедлайна {dl} дн.
                        </span>
                      )}
                    </div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ds-ink)', margin: '0 0 6px 0', letterSpacing: '-0.01em', lineHeight: 1.25 }}>
                      {s.title}
                    </h2>
                    <div style={{ fontSize: 13, color: 'var(--ds-ink-dim)', marginBottom: 10 }}>
                      {s.institution}
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--ds-ink)', lineHeight: 1.55, margin: '0 0 10px 0' }}>
                      {s.description}
                    </p>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--ds-muted)' }}>
                      <span><b style={{ color: 'var(--ds-ink)' }}>{s.amount}</b></span>
                      {s.deadline ? (
                        <span>📅 до {fmtDate(s.deadline)}</span>
                      ) : (
                        <span style={{ fontStyle: 'italic' }}>дедлайн уточняется</span>
                      )}
                      <span>· Готовим</span>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        <div style={{ marginTop: 32, padding: '20px 24px', background: 'var(--ds-bg-alt)', borderRadius: 'var(--ds-r-md)', fontSize: 13, color: 'var(--ds-ink-dim)', lineHeight: 1.6 }}>
          <b style={{ color: 'var(--ds-ink)' }}>Что дальше?</b><br />
          Куратор подскажет какие подать в первую очередь и поможет собрать документы.
        </div>
      </main>
    </div>
  )
}
