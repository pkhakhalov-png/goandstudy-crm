'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MAIN_PAGE_PRIORITY_LIMIT, type University } from '../mock-data'
import {
  useClientState,
  togglePriority,
  priorityRank,
  reorderPriority,
  movePriority,
} from '../shared-store'
import { applyFromShortlist } from './actions'

export type ShortlistAppStatus = {
  id: string
  stage: 'created' | 'docs_collected' | 'fee_paid' | 'submitted' | 'decision'
  hasWizard: boolean
}

interface Props {
  items: University[]
  clientId?: number
  applicationsBySchool?: Record<string, ShortlistAppStatus>
}

const SPECIALTY_GROUPS = new Set([
  'Бизнес и управление', 'IT и технологии', 'Экономика и финансы', 'Инженерия',
  'Медицина и здоровье', 'Право', 'Дизайн и искусство', 'Гуманитарные науки',
  'Естественные науки', 'Социальные науки', 'Образование', 'Медиа и коммуникации',
  'Туризм и гостиничный', 'Архитектура', 'Языковые курсы', 'Другое',
])

function pickTitleAndSubtitle(uni: University, programHref: string | null, schoolHref: string | null) {
  const isPlaceholder = !!uni.program && SPECIALTY_GROUPS.has(uni.program)
  return isPlaceholder
    ? { titleHref: schoolHref, titleText: uni.name, subHref: uni.programId ? programHref : null, subText: uni.program }
    : { titleHref: uni.programId ? programHref : null, titleText: uni.program, subHref: schoolHref, subText: uni.name }
}

function lookupAppForUni(uni: University, apps?: Record<string, ShortlistAppStatus>): ShortlistAppStatus | null {
  if (!apps) return null
  if (uni.schoolId && apps[`id:${uni.schoolId}`]) return apps[`id:${uni.schoolId}`]
  const nameKey = uni.name.trim().toLowerCase()
  return apps[`name:${nameKey}`] ?? null
}

export function ShortlistView({ items, clientId, applicationsBySchool }: Props) {
  const { state, update, hydrated } = useClientState()
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const { priority, rest } = useMemo(() => {
    const keyIndex = new Map(items.map((u, i) => [u.key, i] as const))
    const priority = state.priorityUniKeys
      .map(k => items.find(u => u.key === k))
      .filter((x): x is University => Boolean(x))
    const rest = items
      .filter(u => !state.priorityUniKeys.includes(u.key))
      .sort((a, b) => (b.match - a.match) || (keyIndex.get(a.key)! - keyIndex.get(b.key)!))
    return { priority, rest }
  }, [items, state.priorityUniKeys])

  const selectedCount = priority.length
  const mainPageCount = Math.min(selectedCount, MAIN_PAGE_PRIORITY_LIMIT)

  /* ─── drag handlers ─── */
  function onDragStart(idx: number) {
    setDragFromIdx(idx)
  }
  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setDragOverIdx(idx)
  }
  function onDrop(idx: number) {
    if (dragFromIdx != null && dragFromIdx !== idx) {
      update(s => reorderPriority(s, dragFromIdx, idx))
    }
    setDragFromIdx(null)
    setDragOverIdx(null)
  }
  function onDragEnd() {
    setDragFromIdx(null)
    setDragOverIdx(null)
  }

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
              color: selectedCount > 0 ? 'var(--ds-purple-deep)' : 'var(--ds-muted)',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
              letterSpacing: 0,
            }}
          >
            {selectedCount}
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
              {selectedCount === 0
                ? 'Выбери приоритетные'
                : `Приоритетн${formatWord(selectedCount, ['ая', 'ые', 'ых'])} ${formatWord(selectedCount, ['программа', 'программы', 'программ'])}`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 2 }}>
              {selectedCount === 0
                ? 'Отметь сколько угодно — на главной показываются первые ' + MAIN_PAGE_PRIORITY_LIMIT + '.'
                : selectedCount <= MAIN_PAGE_PRIORITY_LIMIT
                  ? 'Все показываются на главной кабинета.'
                  : `На главной — первые ${MAIN_PAGE_PRIORITY_LIMIT}. Переставь порядок чтобы поменять что показывается.`}
            </div>
          </div>
        </div>
        {selectedCount > 0 && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--ds-muted)',
              fontWeight: 500,
              background: 'var(--ds-bg-alt)',
              padding: '6px 12px',
              borderRadius: 100,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            На главной: {mainPageCount} из {selectedCount}
          </div>
        )}
      </div>

      {/* ═══ PRIORITY — top ═══ */}
      <section>
        <SectionHeader
          eyebrow="Приоритет"
          title={selectedCount > 0 ? 'Ваш выбор' : 'Пока не выбрано'}
          subtitle={
            selectedCount > 0
              ? 'Перетащи карточку за иконку ⋮⋮ слева чтобы поменять порядок. Первые 3 показываются на главной.'
              : 'Отметьте программы ниже кнопкой «+ В приоритет». Они появятся здесь сверху.'
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
            Пролистай список ниже и нажми <b style={{ color: 'var(--ds-ink)' }}>«+ В приоритет»</b>.
          </div>
        ) : (
          <div
            style={{
              marginTop: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 16,
            }}
          >
            {priority.map((uni, idx) => (
              <PriorityCard
                key={uni.key}
                uni={uni}
                rank={idx + 1}
                total={priority.length}
                inMainPage={idx < MAIN_PAGE_PRIORITY_LIMIT}
                isDragging={dragFromIdx === idx}
                isDragOver={dragOverIdx === idx && dragFromIdx !== idx}
                onDragStart={() => onDragStart(idx)}
                onDragOver={(e) => onDragOver(e, idx)}
                onDrop={() => onDrop(idx)}
                onDragEnd={onDragEnd}
                onMoveUp={idx > 0 ? () => update(s => movePriority(s, uni.key, 'up')) : undefined}
                onMoveDown={idx < priority.length - 1 ? () => update(s => movePriority(s, uni.key, 'down')) : undefined}
                onRemove={() => update(s => togglePriority(s, uni.key))}
                hydrated={hydrated}
                clientId={clientId}
                app={lookupAppForUni(uni, applicationsBySchool)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ═══ REST ═══ */}
      {rest.length > 0 && (
        <section>
          <SectionHeader
            eyebrow="Остальные варианты"
            title={`Ещё ${rest.length} ${formatWord(rest.length, ['программа', 'программы', 'программ'])}`}
            subtitle="Куратор оставил их в резерве. Можно добавить в приоритет в любой момент — сколько захочешь."
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
              <RestCard
                key={uni.key}
                uni={uni}
                onToggle={() => update(s => togglePriority(s, uni.key))}
                hydrated={hydrated}
                clientId={clientId}
                app={lookupAppForUni(uni, applicationsBySchool)}
              />
            ))}
          </div>
        </section>
      )}
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
        <p style={{ fontSize: 14, color: 'var(--ds-muted)', margin: '6px 0 0', lineHeight: 1.5, maxWidth: 760 }}>
          {subtitle}
        </p>
      )}
    </header>
  )
}

/* ═══════════════════════════════════════════════════════════════
   PriorityCard — с drag-handle + ↑↓ кнопками + убрать
   ═══════════════════════════════════════════════════════════════ */

function PriorityCard({
  uni, rank, total, inMainPage,
  isDragging, isDragOver,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onMoveUp, onMoveDown, onRemove,
  hydrated, clientId, app,
}: {
  uni: University
  rank: number
  total: number
  inMainPage: boolean
  isDragging: boolean
  isDragOver: boolean
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  onDragEnd: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onRemove: () => void
  hydrated: boolean
  clientId?: number
  app?: ShortlistAppStatus | null
}) {
  return (
    <article
      draggable={hydrated}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{
        background: inMainPage ? 'var(--ds-bg-alt)' : 'var(--ds-bg)',
        border: `1px solid ${inMainPage ? 'var(--ds-purple)' : 'var(--ds-border)'}`,
        borderRadius: 'var(--ds-r-xl)',
        padding: 22,
        paddingLeft: 16,
        boxShadow: inMainPage ? '0 0 0 3px rgba(181,127,207,0.12)' : 'var(--ds-sh-sm)',
        display: 'flex',
        gap: 10,
        position: 'relative',
        opacity: isDragging ? 0.4 : 1,
        transform: isDragOver ? 'scale(1.02)' : 'scale(1)',
        transition: 'transform 150ms, opacity 150ms',
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      {/* ── Drag handle + arrows column ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
          paddingTop: 4,
        }}
      >
        <div
          title="Перетащи чтобы поменять порядок"
          style={{
            cursor: 'grab',
            color: 'var(--ds-muted)',
            padding: 4,
            opacity: 0.55,
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 3px)',
            gridAutoRows: '3px',
            gap: 3,
            userSelect: 'none',
          }}
        >
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} style={{ width: 3, height: 3, background: 'currentColor', borderRadius: '50%' }} />
          ))}
        </div>

        <button
          type="button"
          onClick={onMoveUp}
          disabled={!onMoveUp || !hydrated}
          aria-label="Переместить выше"
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: 'var(--ds-bg)',
            border: '1px solid var(--ds-border)',
            color: 'var(--ds-ink)',
            cursor: onMoveUp ? 'pointer' : 'not-allowed',
            opacity: onMoveUp ? 1 : 0.35,
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ↑
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={!onMoveDown || !hydrated}
          aria-label="Переместить ниже"
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: 'var(--ds-bg)',
            border: '1px solid var(--ds-border)',
            color: 'var(--ds-ink)',
            cursor: onMoveDown ? 'pointer' : 'not-allowed',
            opacity: onMoveDown ? 1 : 0.35,
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ↓
        </button>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        {/* rank + main-page badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                background: inMainPage ? 'var(--ds-purple)' : 'var(--ds-bg-alt)',
                color: inMainPage ? '#fff' : 'var(--ds-muted)',
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
              #{rank}
            </span>
            {inMainPage && (
              <span
                className="ds-chip ds-chip-warning"
                style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10, fontWeight: 700 }}
              >
                ★ на главной
              </span>
            )}
            {!inMainPage && (
              <span
                className="ds-chip ds-chip-neutral"
                style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10, fontWeight: 700 }}
              >
                резерв
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Убрать из приоритета"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--ds-muted)',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              padding: 4,
              opacity: 0.6,
              transition: 'opacity 120ms, color 120ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--ds-error)' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.color = 'var(--ds-muted)' }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <UniLogo uni={uni} size={48} />
          <UniInfo uni={uni} clientId={clientId} app={app} />
        </div>
      </div>
    </article>
  )
}

/* ═══════════════════════════════════════════════════════════════
   RestCard — для невыбранных (+ В приоритет)
   ═══════════════════════════════════════════════════════════════ */

function RestCard({ uni, onToggle, hydrated, clientId, app }: { uni: University; onToggle: () => void; hydrated: boolean; clientId?: number; app?: ShortlistAppStatus | null }) {
  return (
    <article
      style={{
        background: 'var(--ds-bg)',
        border: '1px solid var(--ds-border-soft)',
        borderRadius: 'var(--ds-r-xl)',
        padding: 22,
        boxShadow: 'var(--ds-sh-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <UniLogo uni={uni} size={44} />
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

      <UniInfo uni={uni} clientId={clientId} app={app} />

      <button
        type="button"
        onClick={onToggle}
        disabled={!hydrated}
        className="ds-btn ds-btn-primary ds-btn-sm"
        style={{ alignSelf: 'stretch' }}
      >
        + В приоритет
      </button>
    </article>
  )
}

/* ─── Shared content block — uni info ─── */

function ApplyButton({
  uni,
  app,
  disabled,
}: {
  uni: University
  app: ShortlistAppStatus | null
  disabled: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const handleApply = () => {
    setErr(null)
    startTransition(async () => {
      const r = await applyFromShortlist({
        schoolId: uni.schoolId ?? null,
        schoolName: uni.name,
        programId: uni.programId ?? null,
        programName: uni.program,
        country: uni.country,
        level: 'bachelor',
      })
      if (!r.ok) { setErr(r.error); return }
      const url = r.hasWizard
        ? `/client/applications/${r.applicationId}/wizard`
        : `/client/applications/${r.applicationId}`
      router.push(url)
    })
  }

  if (app) {
    const labels: Record<ShortlistAppStatus['stage'], string> = {
      created: 'Открыть заявку',
      docs_collected: 'Открыть заявку',
      fee_paid: 'Открыть заявку',
      submitted: 'Заявка отправлена',
      decision: 'Решение получено',
    }
    const isOpen = app.stage === 'created' || app.stage === 'docs_collected' || app.stage === 'fee_paid'
    const url = (isOpen && app.hasWizard)
      ? `/client/applications/${app.id}/wizard`
      : `/client/applications/${app.id}`
    return (
      <Link
        href={url}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 14px',
          background: app.stage === 'submitted' || app.stage === 'decision'
            ? 'var(--ds-success-soft)' : 'var(--ds-purple-soft)',
          border: `1px solid ${app.stage === 'submitted' || app.stage === 'decision' ? 'rgba(52,199,89,0.32)' : 'var(--ds-purple)'}`,
          color: 'var(--ds-ink)',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          textDecoration: 'none',
          marginTop: 10,
        }}
        onClick={e => e.stopPropagation()}
      >
        {app.stage === 'submitted' && '✓ '}{labels[app.stage]}
      </Link>
    )
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handleApply() }}
        disabled={disabled || pending}
        className="ds-btn ds-btn-primary ds-btn-sm"
        style={{ fontSize: 12, padding: '8px 14px' }}
      >
        {pending ? 'Создаём...' : 'Подать заявку'}
      </button>
      {err && <div style={{ fontSize: 11, color: 'var(--ds-error)', marginTop: 4 }}>{err}</div>}
    </div>
  )
}

function UniInfo({ uni, clientId, app }: { uni: University; clientId?: number; app?: ShortlistAppStatus | null }) {
  const qs = `?asClient=1${clientId ? `&clientId=${clientId}` : ''}`
  const programHref = uni.programId ? `/curator/programs/${uni.programId}${qs}` : null
  const schoolHref = uni.schoolId ? `/curator/universities/${uni.schoolId}${qs}` : null
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
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
        {(() => {
          const { titleHref, titleText } = pickTitleAndSubtitle(uni, programHref, schoolHref)
          return titleHref ? (
            <Link
              href={titleHref}
              style={{ textDecoration: 'none', color: 'inherit' }}
              className="ds-link-hover"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {titleText}
            </Link>
          ) : titleText
        })()}
      </h4>
      <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginBottom: 8 }}>
        {(() => {
          const { subHref, subText } = pickTitleAndSubtitle(uni, programHref, schoolHref)
          return (
            <>
              {subHref ? (
                <Link
                  href={subHref}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                  className="ds-link-hover"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {subText}
                </Link>
              ) : subText} · {uni.city} · {uni.country}
            </>
          )
        })()}
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
      {app !== undefined && (
        <ApplyButton uni={uni} app={app} disabled={false} />
      )}
    </div>
  )
}

/* ─── Shared: logo + links ─── */

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
        fontSize: Math.round(size * 0.4),
        fontWeight: 700,
        border: '1px solid var(--ds-border-soft)',
      }}
    >
      {letter}
    </div>
  )
}

/* ─── helpers ─── */

function formatWord(n: number, forms: [string, string, string]) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1]
  return forms[2]
}
