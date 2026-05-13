'use client'

import Link from 'next/link'
import { DemoTopNav } from '../DemoTopNav'
import { DEMO_ACTIVITIES } from '../data'

const TYPE_META: Record<string, { emoji: string; label: string }> = {
  stage_change:           { emoji: '🚦', label: 'Этап' },
  essay_approved:         { emoji: '✅', label: 'Эссе утверждено' },
  essay_unapproved:       { emoji: '↩️', label: 'Эссе на доработке' },
  roadmap_sent:           { emoji: '📤', label: 'Дорожная карта отправлена' },
  roadmap_approved:       { emoji: '🗺️', label: 'Дорожная карта утверждена' },
  shortlist_added:        { emoji: '🎓', label: 'Подборка вузов' },
  shortlist_published:    { emoji: '📤', label: 'Подборка отправлена' },
  scholarship_added:      { emoji: '⭐', label: 'Стипендия' },
  application_created:    { emoji: '📝', label: 'Заявка создана' },
  project_field_filled:   { emoji: '📋', label: 'Проект студента' },
  project_confirmed:      { emoji: '✅', label: 'Проект подтверждён' },
  note:                   { emoji: '💬', label: 'Заметка' },
}

function fmtDateTime(d: Date) {
  return d.toLocaleString('ru', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ч назад`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day} дн назад`
  return fmtDateTime(d)
}

export default function DemoUpdatesPage() {
  const activities = DEMO_ACTIVITIES.filter(a => a.type !== 'note').map((a, i) => ({
    id: `demo-${i}`,
    type: a.type,
    content: a.content,
    date: new Date(Date.now() - a.days * 24 * 3600 * 1000),
  }))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg)' }}>
      <DemoTopNav activePage="updates" />

      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--ds-border-soft)', background: 'var(--ds-bg)' }}>
        <div aria-hidden style={{ position: 'absolute', top: '-30%', left: '-10%', width: 1000, height: 600, background: 'radial-gradient(ellipse at center, rgba(181,127,207,0.16) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 900, margin: '0 auto', padding: '40px 32px 28px' }}>
          <Link href="/demo" style={{ fontSize: 12, color: 'var(--ds-purple)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            ← Вернуться в кабинет
          </Link>
          <h1 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '0.02em', lineHeight: 1, margin: '0 0 12px 0', textTransform: 'uppercase' }}>
            Лента <span className="ds-hl">обновлений</span>
          </h1>
          <p style={{ fontSize: 16, color: 'var(--ds-ink-dim)', maxWidth: 720, lineHeight: 1.5, margin: 0 }}>
            Что куратор сделал по твоему проекту — все ключевые события собраны здесь по дате.
          </p>
        </div>
      </section>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 32px 80px' }}>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {activities.map(a => {
            const meta = TYPE_META[a.type] || { emoji: '•', label: a.type }
            return (
              <li
                key={a.id}
                className="ds-card"
                style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '44px 1fr auto', alignItems: 'center', gap: 14 }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 'var(--ds-r-md)', background: 'var(--ds-purple-soft)', color: 'var(--ds-purple-deep)', display: 'grid', placeItems: 'center', fontSize: 22 }}>
                  {meta.emoji}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ds-purple-deep)', marginBottom: 4 }}>
                    {meta.label}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--ds-ink)', lineHeight: 1.4 }}>
                    {a.content || '—'}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ds-muted)', whiteSpace: 'nowrap' }} title={fmtDateTime(a.date)}>
                  {relativeTime(a.date)}
                </div>
              </li>
            )
          })}
        </ol>
      </main>
    </div>
  )
}
