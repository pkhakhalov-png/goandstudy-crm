import Link from 'next/link'
import type { Essay } from './mock-data'

interface Props {
  essays: Essay[]
}

const HREFS: Record<string, string | undefined> = {
  resume: '/client/resume',
  motivation: '/client/motivation',
}

export function EssayCards({ essays }: Props) {
  return (
    <div
      className="essay-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 20,
      }}
    >
      <style>{`
        @media (max-width: 720px) {
          .essay-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {essays.map(essay => (
        <EssayCard key={essay.key} essay={essay} />
      ))}
    </div>
  )
}

function EssayCard({ essay }: { essay: Essay }) {
  const meta = stateMeta(essay.state)
  const ctaText =
    essay.state === 'not_started' ? 'Создать' :
    essay.state === 'in_progress' ? 'Продолжить' :
    'Открыть'

  return (
    <article
      className="ds-card"
      style={{
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 18,
        minHeight: 300,
        position: 'relative',
      }}
    >
      {/* Status chip top-right — видно сразу что начали но не закончили */}
      {meta.chipText && (
        <span
          className={`ds-chip ${meta.chipClass}`}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {meta.chipText}
        </span>
      )}

      {/* ЧБ эмодзи — CSS-grayscale через SVG-фильтр */}
      <div
        style={{
          fontSize: 72,
          lineHeight: 1,
          filter: 'grayscale(1) contrast(1.15)',
          opacity: 0.85,
          marginTop: 8,
        }}
      >
        {essay.emoji}
      </div>

      <div>
        <h3
          style={{
            fontFamily: 'var(--ds-font-display-stack)',
            fontWeight: 700,
            fontSize: 20,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--ds-ink)',
            margin: '0 0 8px 0',
            lineHeight: 1.1,
          }}
        >
          {essay.title}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--ds-muted)', margin: 0, lineHeight: 1.45, maxWidth: 320 }}>
          {essay.subtitle}
        </p>
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        {HREFS[essay.key] ? (
          <Link href={HREFS[essay.key]!} className="ds-btn ds-btn-primary" style={{ minWidth: 160, textDecoration: 'none' }}>
            {ctaText}
          </Link>
        ) : (
          <button className="ds-btn ds-btn-primary" type="button" style={{ minWidth: 160 }}>
            {ctaText}
          </button>
        )}
        <div style={{ fontSize: 11, color: 'var(--ds-muted)', fontWeight: 500 }}>
          {meta.label}
        </div>
      </div>
    </article>
  )
}

function stateMeta(state: Essay['state']): { label: string; chipText: string | null; chipClass: string } {
  switch (state) {
    case 'not_started': return { label: 'Нужно сделать',           chipText: null,             chipClass: '' }
    case 'in_progress': return { label: 'Заполняешь',              chipText: 'в работе',       chipClass: 'ds-chip-warning' }
    case 'sent':        return { label: 'Отправлено куратору',     chipText: 'у куратора',     chipClass: 'ds-chip-info' }
    case 'editing':     return { label: 'Куратор дорабатывает',    chipText: 'у куратора',     chipClass: 'ds-chip-info' }
    case 'ready':       return { label: 'Готово, финальная версия', chipText: '✓ готово',       chipClass: 'ds-chip-success' }
  }
}
