import type { ClientContext, TimelineStage } from './mock-data'

interface Props {
  ctx: ClientContext
  stages: TimelineStage[]
}

// Берём только имя: первое слово из ФИО. Без склонений (используем
// текст в именительном падеже: «Путь Анастасии» сложно склонять для
// произвольного имени → пишем «Путь Анастасия» — нейтрально).
function firstNameOnly(full: string): string {
  return (full || '').trim().split(/\s+/)[0] || ''
}

// Русское склонение «1 этап / 2 этапа / 5 этапов»
function pluralStages(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} этап`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} этапа`
  return `${n} этапов`
}

export function DashboardHero({ ctx, stages }: Props) {
  const currentStage = stages.find(s => s.state === 'current')
  const doneCount = stages.filter(s => s.state === 'done').length
  const currentShare = (currentStage?.progress ?? 0) / 100
  const total = stages.length || 1
  const progress = Math.round(((doneCount + currentShare) / total) * 100)
  const withinStage = currentStage?.progress ?? 0

  // Gradient intensity grows with progress: 0% → faint purple, 100% → vivid pink
  const t = progress / 100
  // Purple (181, 127, 207) → Pink (232, 96, 168)
  const r = Math.round(181 + (232 - 181) * t)
  const g = Math.round(127 + (96 - 127) * t)
  const b = Math.round(207 + (168 - 207) * t)
  const baseOpacity = 0.12 + t * 0.45 // 0.12 at 0% → 0.57 at 100%
  const midOpacity = 0.04 + t * 0.25
  const amberOpacity = 0.08 + t * 0.22

  const primaryGradient = `radial-gradient(ellipse at center, rgba(${r},${g},${b},${baseOpacity}) 0%, rgba(${r},${g},${b},${midOpacity}) 40%, transparent 70%)`
  const amberGradient = `radial-gradient(ellipse at center, rgba(232,184,68,${amberOpacity}) 0%, rgba(232,184,68,${amberOpacity * 0.3}) 45%, transparent 70%)`

  return (
    <section
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderBottom: '1px solid var(--ds-border-soft)',
        background: 'var(--ds-bg)',
      }}
    >
      {/* Purple → Pink radial (intensity grows with progress) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '-30%',
          left: '-10%',
          width: 1100,
          height: 700,
          background: primaryGradient,
          pointerEvents: 'none',
          transition: 'background 800ms ease',
        }}
      />
      {/* Amber radial */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '-20%',
          right: '-10%',
          width: 800,
          height: 500,
          background: amberGradient,
          pointerEvents: 'none',
          transition: 'background 800ms ease',
        }}
      />
      {/* Fade-down mask — чтобы градиент растворялся снизу в чистый фон */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, transparent 0%, transparent 40%, var(--ds-bg) 100%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'relative',
          maxWidth: 1200,
          margin: '0 auto',
          padding: '56px 32px 48px',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--ds-font-display-stack)',
            fontWeight: 700,
            fontSize: 'clamp(36px, 5vw, 64px)',
            letterSpacing: '0.01em',
            lineHeight: 1,
            margin: '0 0 24px 0',
            textTransform: 'uppercase',
          }}
        >
          Прогресс <span className="ds-hl">поступления</span>
        </h1>

        {/* Прогресс — крупный % + метка */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 32 }}>
          <span
            style={{
              fontFamily: 'var(--ds-font-display-stack)',
              fontWeight: 700,
              fontSize: 72,
              lineHeight: 0.9,
              color: 'var(--ds-purple-deep)',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: 0,
            }}
          >
            {progress}%
          </span>
          <span style={{ fontSize: 14, color: 'var(--ds-muted)' }}>
            пройдено · осталось {pluralStages(stages.filter(s => s.state !== 'done').length)}
          </span>
        </div>

        {/* Таймлайн */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${stages.length}, 1fr)`,
            gap: 12,
            paddingTop: 24,
            borderTop: '1px solid var(--ds-border-soft)',
          }}
        >
          {stages.map((stage, idx) => (
            <TimelineStep key={stage.key} stage={stage} isLast={idx === stages.length - 1} />
          ))}
        </div>
      </div>
    </section>
  )
}

function TimelineStep({ stage, isLast }: { stage: TimelineStage; isLast: boolean }) {
  const done = stage.state === 'done'
  const current = stage.state === 'current'

  return (
    <div style={{ position: 'relative' }}>
      {!isLast && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 13,
            left: '60%',
            width: '80%',
            height: 2,
            background: done ? 'var(--ds-purple)' : 'var(--ds-border)',
            borderRadius: 1,
          }}
        />
      )}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: done ? 'var(--ds-purple)' : 'var(--ds-bg)',
          border: `2px solid ${done || current ? 'var(--ds-purple)' : 'var(--ds-border)'}`,
          color: done ? '#fff' : current ? 'var(--ds-purple)' : 'var(--ds-muted)',
          display: 'grid',
          placeItems: 'center',
          fontSize: 11,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          position: 'relative',
          zIndex: 2,
          boxShadow: current ? '0 0 0 4px rgba(181,127,207,0.2)' : 'none',
        }}
      >
        {done ? '✓' : stage.num}
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          marginTop: 10,
          color: done || current ? 'var(--ds-ink)' : 'var(--ds-muted)',
          lineHeight: 1.25,
        }}
      >
        {stage.title}
      </div>
    </div>
  )
}
