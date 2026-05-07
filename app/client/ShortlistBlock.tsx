'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { University } from './mock-data'
import { MAIN_PAGE_PRIORITY_LIMIT } from './mock-data'
import { useClientState } from './shared-store'

interface Props {
  items: University[] // полный список от куратора (15)
  total: number
  clientId?: number
}

const SPECIALTY_GROUPS = new Set([
  'Бизнес и управление', 'IT и технологии', 'Экономика и финансы', 'Инженерия',
  'Медицина и здоровье', 'Право', 'Дизайн и искусство', 'Гуманитарные науки',
  'Естественные науки', 'Социальные науки', 'Образование', 'Медиа и коммуникации',
  'Туризм и гостиничный', 'Архитектура', 'Языковые курсы', 'Другое',
])

// Если program_name — placeholder-специальность (BD-импорт),
// школа становится primary-заголовком, специализация — вторичная строка.
function pickTitleAndSubtitle(uni: University, programHref: string | null, schoolHref: string | null) {
  const isPlaceholder = !!uni.program && SPECIALTY_GROUPS.has(uni.program)
  return isPlaceholder
    ? { titleHref: schoolHref, titleText: uni.name, subHref: uni.programId ? programHref : null, subText: uni.program }
    : { titleHref: uni.programId ? programHref : null, titleText: uni.program, subHref: schoolHref, subText: uni.name }
}

export function ShortlistBlock({ items, total, clientId }: Props) {
  const { state, hydrated } = useClientState()

  const { shown, selectedCount } = useMemo(() => {
    const all = state.priorityUniKeys
      .map(k => items.find(u => u.key === k))
      .filter((x): x is University => Boolean(x))
    return {
      shown: all.slice(0, MAIN_PAGE_PRIORITY_LIMIT),
      selectedCount: all.length,
    }
  }, [items, state.priorityUniKeys])

  const hasAny = selectedCount > 0
  const moreCount = selectedCount - shown.length

  return (
    <div className="ds-card" style={{ padding: 32 }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 24,
          flexWrap: 'wrap',
        }}
      >
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
            {hasAny ? 'Приоритетные вузы' : 'Выбери приоритетные'}
          </h2>
          <p style={{ fontSize: 14, color: 'var(--ds-muted)', margin: '6px 0 0', maxWidth: 560, letterSpacing: '-0.005em' }}>
            {hasAny
              ? moreCount > 0
                ? `Первые ${shown.length} из ${selectedCount} приоритетных. Всего в подборке — ${total}.`
                : `${selectedCount} ${selectedCount === 1 ? 'приоритетная программа' : 'в приоритете'}. Всего в подборке — ${total}.`
              : `Куратор подготовил ${total} программ. Выбери приоритетные — на главной появятся первые ${MAIN_PAGE_PRIORITY_LIMIT}.`}
          </p>
        </div>
        <Link
          href="/client/shortlist"
          className="ds-btn ds-btn-secondary ds-btn-sm"
          style={{ textDecoration: 'none' }}
        >
          {hasAny
            ? moreCount > 0
              ? `+ ещё ${moreCount} приоритет${moreCount === 1 ? 'ная' : 'ных'} · все ${total} →`
              : `Все ${total} вузов →`
            : `Выбрать приоритетные →`}
        </Link>
      </header>

      {/* ─── Empty state (до гидратации или когда 0 выбрано) ─── */}
      {(!hydrated || !hasAny) ? (
        <EmptyState total={total} />
      ) : (
        <div
          className="shortlist-priority-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.max(1, shown.length)}, 1fr)`,
            gap: 16,
          }}
        >
          <style>{`
            @media (max-width: 960px) { .shortlist-priority-grid { grid-template-columns: 1fr 1fr !important; } }
            @media (max-width: 600px) { .shortlist-priority-grid { grid-template-columns: 1fr !important; } }
          `}</style>
          {shown.map((uni, idx) => (
            <UniCard key={uni.key} uni={uni} rank={idx + 1} clientId={clientId} />
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({ total }: { total: number }) {
  // Когда куратор уже подобрал (total > 0), но клиент ещё не посмотрел —
  // визуально это «новая подборка», а не пустое состояние. Solid purple
  // фон + значок NEW + крупная CTA-кнопка.
  const hasCuratorPicks = total > 0
  if (hasCuratorPicks) {
    return (
      <Link
        href="/client/shortlist"
        style={{
          display: 'block',
          position: 'relative',
          padding: '40px 32px',
          background: 'linear-gradient(135deg, var(--ds-purple-soft) 0%, rgba(177,94,204,0.04) 100%)',
          border: '1.5px solid var(--ds-purple)',
          borderRadius: 'var(--ds-r-lg)',
          textDecoration: 'none',
          color: 'var(--ds-ink)',
          overflow: 'hidden',
          transition: 'all 150ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 12px 32px -8px rgba(177,94,204,0.35)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        {/* «NEW» бейдж в углу */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'var(--ds-purple)',
            color: '#fff',
            padding: '4px 10px',
            borderRadius: 100,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          ✨ Новая
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'var(--ds-purple)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontSize: 30,
              flexShrink: 0,
              boxShadow: '0 8px 24px -6px rgba(177,94,204,0.5)',
            }}
          >
            🎓
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div
              style={{
                fontFamily: 'var(--ds-font-display-stack)',
                fontWeight: 700,
                fontSize: 22,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--ds-ink)',
                marginBottom: 4,
              }}
            >
              Подборка готова — {total} программ
            </div>
            <div style={{ fontSize: 14, color: 'var(--ds-ink-dim)', lineHeight: 1.5 }}>
              Куратор подобрал вузы под твой профиль. Открой, изучи и отметь
              приоритетные — на главной покажем первые {MAIN_PAGE_PRIORITY_LIMIT}.
            </div>
          </div>
          <div
            style={{
              flexShrink: 0,
              padding: '14px 24px',
              background: 'var(--ds-purple)',
              color: '#fff',
              borderRadius: 12,
              fontFamily: 'var(--ds-font-display-stack)',
              fontWeight: 700,
              fontSize: 14,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              whiteSpace: 'nowrap',
            }}
          >
            Открыть →
          </div>
        </div>
      </Link>
    )
  }

  // Реальное пустое — куратор ещё не подобрал. Не пугающий dashed-empty,
  // а спокойный «всё под контролем, мы работаем».
  return (
    <div
      style={{
        position: 'relative',
        padding: '36px 32px',
        background: 'var(--ds-bg-alt)',
        border: '1px solid var(--ds-border-soft)',
        borderRadius: 'var(--ds-r-lg)',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: '#fff',
          border: '1px solid var(--ds-border-soft)',
          color: 'var(--ds-purple-deep)',
          display: 'grid',
          placeItems: 'center',
          fontSize: 26,
          flexShrink: 0,
        }}
      >
        🔍
      </div>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div
          style={{
            fontFamily: 'var(--ds-font-display-stack)',
            fontWeight: 700,
            fontSize: 17,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--ds-ink)',
            marginBottom: 4,
          }}
        >
          Куратор подбирает программы
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ds-ink-dim)', lineHeight: 1.5 }}>
          После стратегической сессии куратор соберёт список вузов под твой
          профиль — обычно это занимает 5-10 рабочих дней. Появится здесь и
          в «Обновлениях».
        </div>
      </div>
    </div>
  )
}

function UniCard({ uni, rank, clientId }: { uni: University; rank: number; clientId?: number }) {
  const qs = `?asClient=1${clientId ? `&clientId=${clientId}` : ''}`
  const programHref = uni.programId ? `/curator/programs/${uni.programId}${qs}` : '/client/shortlist'
  const schoolHref = uni.schoolId ? `/curator/universities/${uni.schoolId}${qs}` : null

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
          <UniLogo uni={uni} size={44} />
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
          {(() => {
            const { titleHref, titleText } = pickTitleAndSubtitle(uni, programHref, schoolHref)
            return titleHref ? (
              <Link href={titleHref} style={{ textDecoration: 'none', color: 'inherit' }} className="ds-link-hover">
                {titleText}
              </Link>
            ) : titleText
          })()}
        </h4>
        <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginBottom: 10 }}>
          {(() => {
            const { subHref, subText } = pickTitleAndSubtitle(uni, programHref, schoolHref)
            return (
              <>
                {subHref ? (
                  <Link href={subHref} style={{ textDecoration: 'none', color: 'inherit' }} className="ds-link-hover">
                    {subText}
                  </Link>
                ) : subText} · {uni.city} · {uni.country}
              </>
            )
          })()}
        </div>
        <p style={{ fontSize: 13, color: 'var(--ds-ink-dim)', lineHeight: 1.45, margin: 0, letterSpacing: '-0.005em' }}>
          {uni.reason}
        </p>
        <CardLinks uni={uni} programHref={uni.programId ? programHref : null} schoolHref={schoolHref} />
      </div>
    </article>
  )
}

function CardLinks({ uni, programHref, schoolHref }: { uni: University; programHref: string | null; schoolHref: string | null }) {
  if (!programHref && !schoolHref) return null
  const linkStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--ds-purple)',
    background: 'var(--ds-purple-soft)',
    border: '1px solid rgba(177,94,204,0.2)',
    padding: '4px 10px',
    borderRadius: 100,
    textDecoration: 'none',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
      {programHref && (
        <Link href={programHref} style={linkStyle}>Программа →</Link>
      )}
      {schoolHref && (
        <Link href={schoolHref} style={linkStyle}>Вуз →</Link>
      )}
    </div>
  )
}

function UniLogo({ uni, size = 44 }: { uni: University; size?: number }) {
  if (uni.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={uni.logoUrl}
        alt={uni.name}
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          objectFit: 'contain',
          background: '#fff',
          border: '1px solid var(--ds-border-soft)',
          flexShrink: 0,
        }}
      />
    )
  }
  const letter = (uni.name || '?').trim()[0]?.toUpperCase() || '?'
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        flexShrink: 0,
        background: 'var(--ds-purple-soft)',
        color: 'var(--ds-purple-deep)',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'var(--ds-font-display-stack)',
        fontSize: size * 0.4,
        fontWeight: 700,
        border: '1px solid var(--ds-border-soft)',
      }}
    >
      {letter}
    </div>
  )
}
