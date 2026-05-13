'use client'

import Link from 'next/link'

interface Props {
  motivationStatus: 'in_progress' | 'sent' | 'editing' | 'ready'
  resumeStatus: 'in_progress' | 'sent' | 'editing' | 'ready'
}

const statusBadge: Record<Props['motivationStatus'], { label: string; color: string }> = {
  in_progress: { label: 'В работе',    color: 'var(--ds-amber)' },
  sent:        { label: 'У куратора',   color: 'var(--ds-purple)' },
  editing:     { label: 'На правках',  color: 'var(--ds-purple)' },
  ready:       { label: 'Утверждено',  color: 'var(--ds-green)' },
}

export function DemoEssayCards({ motivationStatus, resumeStatus }: Props) {
  const cards = [
    { key: 'resume',     title: 'Резюме (CV)',          subtitle: 'в стиле resume.io',          emoji: '📄', status: resumeStatus,     href: '/demo/resume' },
    { key: 'motivation', title: 'Мотивационное письмо', subtitle: 'Personal Statement по UCAS', emoji: '✍️', status: motivationStatus, href: '/demo/motivation' },
  ]

  return (
    <section>
      <header style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 22, letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0 }}>
          Письма и резюме
        </h2>
        <p style={{ fontSize: 12, color: 'var(--ds-ink-dim)', marginTop: 4, letterSpacing: '0.04em' }}>
          Заполняй прямо в кабинете — куратор увидит и подготовит финал
        </p>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {cards.map(c => {
          const badge = statusBadge[c.status]
          return (
            <Link key={c.key} href={c.href}
              style={{
                display: 'block', padding: 24, borderRadius: 16,
                background: 'var(--ds-surface)', border: '1px solid var(--ds-border-soft)',
                textDecoration: 'none', color: 'inherit',
              }}
              className="ds-card-hover"
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>{c.emoji}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ds-ink)', marginBottom: 4 }}>{c.title}</div>
              <div style={{ fontSize: 12, color: 'var(--ds-ink-dim)', marginBottom: 14 }}>{c.subtitle}</div>
              <div style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 4, background: badge.color + '15', color: badge.color }}>
                {badge.label}
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
