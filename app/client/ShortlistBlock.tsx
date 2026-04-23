import type { University } from './mock-data'

interface Props {
  items: University[]
  total: number
}

export function ShortlistBlock({ items, total }: Props) {
  return (
    <div className="ds-card" style={{ padding: 32 }}>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
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
            Вузы для Игоря
          </h2>
          <p style={{ fontSize: 14, color: 'var(--ds-muted)', margin: '6px 0 0', maxWidth: 560 }}>
            {items.length} топ-выбор куратора. Полный список — {total} вузов, финальный shortlist подтвердим к 3 мая.
          </p>
        </div>
        <a
          href="#all-universities"
          className="ds-btn ds-btn-secondary ds-btn-sm"
          style={{ textDecoration: 'none' }}
        >
          Все {total} вузов →
        </a>
      </header>

      <div
        className="shortlist-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${items.length}, 1fr)`,
          gap: 16,
        }}
      >
        <style>{`
          @media (max-width: 960px) {
            .shortlist-grid { grid-template-columns: 1fr 1fr !important; }
          }
          @media (max-width: 600px) {
            .shortlist-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>

        {items.map((uni, idx) => (
          <UniCard key={uni.key} uni={uni} rank={idx + 1} />
        ))}
      </div>
    </div>
  )
}

function UniCard({ uni, rank }: { uni: University; rank: number }) {
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
          <div style={{ fontSize: 34, lineHeight: 1 }}>{uni.flag}</div>
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
          {uni.name}
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
          {uni.program}
        </div>
        <p style={{ fontSize: 13, color: 'var(--ds-ink-dim)', lineHeight: 1.45, margin: 0, letterSpacing: '-0.005em' }}>
          {uni.reason}
        </p>
      </div>

      <button
        type="button"
        className="ds-btn ds-btn-ghost ds-btn-sm"
        style={{ padding: 0, alignSelf: 'flex-start' }}
      >
        Подробнее о программе →
      </button>
    </article>
  )
}
