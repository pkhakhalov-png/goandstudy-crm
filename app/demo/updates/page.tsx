'use client'

import Link from 'next/link'
import { DemoTopNav } from '../DemoTopNav'
import { DEMO_ACTIVITIES } from '../data'

const TYPE_META: Record<string, { emoji: string; label: string }> = {
  stage_change: { emoji: '➡️', label: 'Этап' },
  note: { emoji: '📝', label: 'Заметка' },
  project_field_filled: { emoji: '🧩', label: 'Профиль' },
  project_confirmed: { emoji: '✅', label: 'Профиль' },
  shortlist_added: { emoji: '🎓', label: 'Подборка' },
  shortlist_published: { emoji: '📚', label: 'Подборка' },
  roadmap_sent: { emoji: '🗺', label: 'Roadmap' },
  roadmap_approved: { emoji: '✔', label: 'Roadmap' },
  scholarship_added: { emoji: '💰', label: 'Стипендия' },
  essay_approved: { emoji: '✍️', label: 'Эссе' },
  application_created: { emoji: '📤', label: 'Заявка' },
}

export default function DemoUpdatesPage() {
  return (
    <>
      <DemoTopNav activePage="updates" />
      <main style={{ maxWidth: 820, margin: '0 auto', padding: '24px 32px 80px' }}>
        <Link href="/demo" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ds-ink-dim)', textDecoration: 'none', marginBottom: 24 }}>
          ← Назад на главную
        </Link>

        <header style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 32, letterSpacing: '0.02em', margin: 0 }}>
            Обновления
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ds-ink-dim)', marginTop: 8 }}>
            История того, что куратор и ты сделали по твоему профилю.
          </p>
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {DEMO_ACTIVITIES.map((a, i) => {
            const meta = TYPE_META[a.type] || { emoji: '•', label: '' }
            const date = new Date(Date.now() - a.days * 24 * 3600 * 1000)
            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 14, alignItems: 'flex-start',
                padding: '16px 18px', borderRadius: 12, background: 'var(--ds-surface)',
                border: '1px solid var(--ds-border-soft)',
              }}>
                <div style={{ fontSize: 22, textAlign: 'center' }}>{meta.emoji}</div>
                <div>
                  {meta.label && (
                    <div style={{ fontSize: 10, color: 'var(--ds-purple)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                      {meta.label}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: 'var(--ds-ink)', lineHeight: 1.5 }}>
                    {a.content}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ds-ink-dim)', whiteSpace: 'nowrap' }}>
                  {date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </>
  )
}
