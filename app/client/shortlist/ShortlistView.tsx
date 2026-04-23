'use client'

import { useMemo } from 'react'
import { MAX_PRIORITY, type University } from '../mock-data'
import { useClientState, togglePriority, priorityRank } from '../shared-store'

interface Props {
  items: University[]
}

export function ShortlistView({ items }: Props) {
  const { state, update, hydrated } = useClientState()

  const { priority, rest } = useMemo(() => {
    const keyIndex = new Map(items.map((u, i) => [u.key, i] as const))
    // priority — отсортированный в порядке выбора клиента
    const priority = state.priorityUniKeys
      .map(k => items.find(u => u.key === k))
      .filter((x): x is University => Boolean(x))
    const rest = items
      .filter(u => !state.priorityUniKeys.includes(u.key))
      // стабильный порядок по match%, иначе — по исходному индексу
      .sort((a, b) => (b.match - a.match) || (keyIndex.get(a.key)! - keyIndex.get(b.key)!))
    return { priority, rest }
  }, [items, state.priorityUniKeys])

  const full = state.priorityUniKeys.length >= MAX_PRIORITY
  const selectedCount = state.priorityUniKeys.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      {/* ═══ PROGRESS ═══ */}
      <div
        className="ds-card"
        style={{
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div
            style={{
              fontFamily: 'var(--ds-font-display-stack)',
              fontWeight: 700,
              fontSize: 32,
              color: full ? 'var(--ds-success-ink)' : 'var(--ds-purple-deep)',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
              letterSpacing: 0,
            }}
          >
            {selectedCount} / {MAX_PRIORITY}
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--ds-font-display-stack)',
                fontWeight: 700,
                fontSize: 14,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--ds-ink)',
              }}
            >
              {full ? 'Приоритеты выбраны' : 'Выбери приоритетные программы'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 2 }}>
              {full
                ? 'На главной кабинета отображаются именно эти три.'
                : `Осталось выбрать ${MAX_PRIORITY - selectedCount} — нажми «В приоритет» на карточке.`}
            </div>
          </div>
        </div>
        <div
          style={{
            width: 200,
            height: 4,
            background: 'var(--ds-bg-alt)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${(selectedCount / MAX_PRIORITY) * 100}%`,
              height: '100%',
              background: full ? 'var(--ds-success)' : 'var(--ds-purple)',
              transition: 'width 200ms ease-out, background 200ms',
            }}
          />
        </div>
      </div>

      {/* ═══ PRIORITY — top ═══ */}
      <section>
        <SectionHeader
          eyebrow="Приоритет"
          title={selectedCount > 0 ? 'Ваш выбор' : 'Пока не выбрано'}
          subtitle={
            selectedCount > 0
              ? 'Эти программы показываются на главной и идут в работу первыми.'
              : `Отметьте до ${MAX_PRIORITY} программ ниже — они появятся здесь сверху.`
          }
        />

        {priority.length === 0 ? (
          <div
            style={{
              marginTop: 16,
              padding: '40px 24px',
              border: '2px dashed var(--ds-border)',
              borderRadius: 'var(--ds-r-xl)',
              textAlign: 'center',
              color: 'var(--ds-muted)',
              fontSize: 14,
              letterSpacing: '-0.005em',
            }}
          >
            Ни одна программа пока не отмечена.
            <br />
            Пролистайте список ниже и нажмите <b style={{ color: 'var(--ds-ink)' }}>«В приоритет»</b> на трёх понравившихся.
          </div>
        ) : (
          <div
            style={{
              marginTop: 16,
              display: 'grid',
              gridTemplateColumns: `repeat(${priority.length}, minmax(0, 1fr))`,
              gap: 16,
            }}
            className="priority-grid"
          >
            <style>{`
              @media (max-width: 920px) { .priority-grid { grid-template-columns: 1fr !important; } }
            `}</style>
            {priority.map((uni) => (
              <UniCard
                key={uni.key}
                uni={uni}
                rank={priorityRank(state, uni.key)}
                isPriority
                full={full}
                onToggle={() => update(s => togglePriority(s, uni.key))}
                hydrated={hydrated}
              />
            ))}
          </div>
        )}
      </section>

      {/* ═══ REST ═══ */}
      <section>
        <SectionHeader
          eyebrow="Остальные варианты"
          title={`Ещё ${rest.length} ${formatWord(rest.length, ['программа', 'программы', 'программ'])}`}
          subtitle="Куратор оставил их в резерве — можно переключить приоритет в любой момент."
        />
        <div
          style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16,
          }}
        >
          {rest.map((uni) => (
            <UniCard
              key={uni.key}
              uni={uni}
              rank={null}
              isPriority={false}
              full={full}
              onToggle={() => update(s => togglePriority(s, uni.key))}
              hydrated={hydrated}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

/* ─── section header ─── */

function SectionHeader({
  eyebrow, title, subtitle,
}: {
  eyebrow: string
  title: string
  subtitle?: string
}) {
  return (
    <header>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--ds-purple)',
          marginBottom: 8,
        }}
      >
        {eyebrow}
      </div>
      <h2
        style={{
          fontFamily: 'var(--ds-font-display-stack)',
          fontWeight: 700,
          fontSize: 'clamp(22px, 2.6vw, 32px)',
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
          lineHeight: 1,
          margin: 0,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p style={{ fontSize: 14, color: 'var(--ds-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
          {subtitle}
        </p>
      )}
    </header>
  )
}

/* ─── Uni card ─── */

function UniCard({
  uni, rank, isPriority, full, onToggle, hydrated,
}: {
  uni: University
  rank: number | null
  isPriority: boolean
  full: boolean
  onToggle: () => void
  hydrated: boolean
}) {
  const disabled = !isPriority && full
  return (
    <article
      style={{
        background: isPriority ? 'var(--ds-bg-alt)' : 'var(--ds-bg)',
        border: `1px solid ${isPriority ? 'var(--ds-purple)' : 'var(--ds-border-soft)'}`,
        borderRadius: 'var(--ds-r-xl)',
        padding: 22,
        boxShadow: isPriority ? '0 0 0 3px rgba(181,127,207,0.12)' : 'var(--ds-sh-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        position: 'relative',
        transition: 'all 150ms',
      }}
    >
      {isPriority && rank != null && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            left: 16,
            background: 'var(--ds-purple)',
            color: '#fff',
            fontFamily: 'var(--ds-font-display-stack)',
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            padding: '4px 10px',
            borderRadius: 100,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          #{rank} приоритет
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 34, lineHeight: 1 }}>{uni.flag}</div>
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
            letterSpacing: '-0.015em',
            color: 'var(--ds-ink)',
            margin: '0 0 4px 0',
            lineHeight: 1.22,
          }}
        >
          {uni.name}
        </h4>
        <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginBottom: 8 }}>
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
        {uni.tuition && (
          <div style={{ fontSize: 12, color: 'var(--ds-ink-dim)', marginBottom: 8 }}>
            <span className="ds-mono" style={{ fontWeight: 600 }}>{uni.tuition}</span>
          </div>
        )}
        <p style={{ fontSize: 13, color: 'var(--ds-ink-dim)', lineHeight: 1.45, margin: 0, letterSpacing: '-0.005em' }}>
          {uni.reason}
        </p>
        {uni.tags && uni.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 10 }}>
            {uni.tags.map(tag => (
              <span
                key={tag}
                className="ds-chip ds-chip-neutral"
                style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10, fontWeight: 700 }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled || !hydrated}
          className={`ds-btn ds-btn-sm ${isPriority ? 'ds-btn-amber' : 'ds-btn-primary'}`}
          style={{
            flex: 1,
            opacity: (disabled || !hydrated) ? 0.5 : 1,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
          title={disabled ? 'Сначала убери одну из уже выбранных приоритетных' : undefined}
        >
          {isPriority ? '✓ В приоритете' : disabled ? 'Приоритеты заняты' : '+ В приоритет'}
        </button>
      </div>
    </article>
  )
}

function formatWord(n: number, forms: [string, string, string]) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1]
  return forms[2]
}
