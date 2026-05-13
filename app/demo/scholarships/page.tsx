'use client'

import Link from 'next/link'
import { DemoTopNav } from '../DemoTopNav'
import { DEMO_SCHOLARSHIPS_FULL } from '../data'

export default function DemoScholarshipsPage() {
  return (
    <>
      <DemoTopNav activePage="scholarships" />
      <main style={{ maxWidth: 980, margin: '0 auto', padding: '24px 32px 80px' }}>
        <Link href="/demo" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ds-ink-dim)', textDecoration: 'none', marginBottom: 24 }}>
          ← Назад на главную
        </Link>
        <header style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 32, letterSpacing: '0.02em', margin: 0 }}>
            Стипендии
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ds-ink-dim)', marginTop: 8 }}>
            Стипендии, которые куратор открыл специально под твой профиль. На каждую помогаем подать.
          </p>
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {DEMO_SCHOLARSHIPS_FULL.map(s => {
            const isUrgent = s.deadline && new Date(s.deadline).getTime() - Date.now() < 30 * 24 * 3600 * 1000
            return (
              <article key={s.id} style={{
                padding: '24px 28px', borderRadius: 16, background: 'var(--ds-surface)',
                border: '1px solid ' + (isUrgent ? 'var(--ds-amber)' : 'var(--ds-border-soft)'),
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: 'var(--ds-ink-dim)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
                      {s.flag} {s.country} · {s.level}
                    </div>
                    <h2 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 20, letterSpacing: '0.02em', margin: 0, lineHeight: 1.25 }}>
                      {s.title}
                    </h2>
                    <div style={{ fontSize: 13, color: 'var(--ds-ink-dim)', marginTop: 4 }}>{s.institution}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ds-purple)' }}>{s.amount}</div>
                    <div style={{ fontSize: 10, color: 'var(--ds-ink-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.fundingType}</div>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: 'var(--ds-ink)', lineHeight: 1.55, margin: 0, marginBottom: 12 }}>{s.description}</p>
                <div style={{ fontSize: 12, color: 'var(--ds-ink-dim)', lineHeight: 1.5 }}>
                  <b style={{ color: 'var(--ds-ink)' }}>Требования: </b>{s.eligibility}
                </div>
                {s.deadline && (
                  <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: isUrgent ? 'rgba(232,184,68,.12)' : 'rgba(177,94,204,.06)', color: isUrgent ? 'var(--ds-amber)' : 'var(--ds-purple)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'inline-block' }}>
                    Дедлайн: {new Date(s.deadline).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </main>
    </>
  )
}
