'use client'

import { useMemo, useState, useEffect, useRef, useTransition } from 'react'
import {
  INITIAL_LETTER,
  MAX_CHARS,
  QUESTIONS,
  SECTION_TITLES,
  SECTION_SUBTITLES,
  type MotivationLetter,
  type SectionKey,
  type Question,
} from './mock'
import { MotivationPreview } from './MotivationPreview'
import { saveClientDraft, submitToCurator } from '@/app/client/essays/actions'

interface Props {
  authorName: string
  initialLetter?: MotivationLetter
  clientId?: number
  status?: 'draft' | 'sent' | 'editing' | 'approved'
}

export function MotivationEditor({ authorName, initialLetter, clientId, status = 'draft' }: Props) {
  const [letter, setLetter] = useState<MotivationLetter>(initialLetter || INITIAL_LETTER)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [pending, startTransition] = useTransition()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLocked = status === 'approved'

  const [saveErrMsg, setSaveErrMsg] = useState<string | null>(null)

  useEffect(() => {
    if (isLocked) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = setTimeout(async () => {
      const res = await saveClientDraft({ clientId, type: 'motivation', content: letter })
      if (res && (res as any).error) {
        setSaveState('error')
        setSaveErrMsg((res as any).error)
      } else {
        setSaveState('saved')
        setSaveErrMsg(null)
      }
    }, 1000)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [letter, clientId, isLocked])

  function handleSubmit() {
    if (pending) return
    startTransition(async () => {
      const saved = await saveClientDraft({ clientId, type: 'motivation', content: letter })
      if (saved && (saved as any).error) {
        alert('Сохранение не удалось: ' + (saved as any).error)
        return
      }
      const res = await submitToCurator({ type: 'motivation', clientId })
      if (res && (res as any).error) alert('Не отправилось: ' + (res as any).error)
      else alert('Письмо отправлено куратору ✓')
    })
  }

  // Только одна секция раскрыта одновременно — как в UCAS билдере
  const [openSection, setOpenSection] = useState<SectionKey | null>('course')

  const charsUsed = useMemo(() => {
    return Object.values(letter).reduce((sum, v) => sum + (v?.length ?? 0), 0)
  }, [letter])
  const remaining = Math.max(0, MAX_CHARS - charsUsed)
  const percentUsed = Math.min(100, Math.round((charsUsed / MAX_CHARS) * 100))

  function update<K extends keyof MotivationLetter>(key: K, value: string) {
    // Жёсткий лимит — не даём превысить 4000 суммарно
    const otherChars = charsUsed - (letter[key]?.length ?? 0)
    const maxForThis = MAX_CHARS - otherChars
    const clipped = value.length > maxForThis ? value.slice(0, maxForThis) : value
    setLetter(l => ({ ...l, [key]: clipped }))
  }

  return (
    <div
      className="motivation-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(360px, 520px)',
        gap: 32,
        alignItems: 'start',
      }}
    >
      <style>{`
        @media (max-width: 1120px) {
          .motivation-grid { grid-template-columns: 1fr !important; }
          .motivation-preview-sticky { position: static !important; }
        }
      `}</style>

      {/* ═══════════════════════════════════════════════════════════
          EDITOR
          ═══════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <EssayStatusBar
        status={status}
        saveState={saveState}
        pending={pending}
        onSubmit={handleSubmit}
        isLocked={isLocked}
      />
      <div
        className="ds-card"
        style={{
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header с title + счётчик */}
        <header
          style={{
            padding: '28px 32px 24px',
            borderBottom: '1px solid var(--ds-border-soft)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: 'var(--ds-font-display-stack)',
                fontWeight: 700,
                fontSize: 'clamp(24px, 2.8vw, 36px)',
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                lineHeight: 1,
                margin: 0,
              }}
            >
              Personal statement<br />builder
            </h2>
            <div
              style={{
                fontSize: 13,
                color: 'var(--ds-muted)',
                marginTop: 10,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.005em',
              }}
            >
              <span style={{ fontWeight: 600, color: remaining < 500 ? 'var(--ds-error)' : 'var(--ds-ink)' }}>
                {remaining}
              </span>{' '}
              из <span className="ds-mono">{MAX_CHARS}</span> символов осталось
            </div>
            {/* Прогресс-бар использования лимита */}
            <div
              style={{
                marginTop: 12,
                width: 'min(320px, 100%)',
                height: 4,
                background: 'var(--ds-bg-alt)',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${percentUsed}%`,
                  height: '100%',
                  background: percentUsed > 90 ? 'var(--ds-error)' : percentUsed > 70 ? 'var(--ds-amber)' : 'var(--ds-purple)',
                  transition: 'width 200ms ease-out, background 200ms',
                }}
              />
            </div>
          </div>

          <MenuButton />
        </header>

        {/* Секции */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {(Object.keys(SECTION_TITLES) as SectionKey[]).map((sectionKey, idx) => (
            <Section
              key={sectionKey}
              sectionKey={sectionKey}
              open={openSection === sectionKey}
              onToggle={() => setOpenSection(openSection === sectionKey ? null : sectionKey)}
              letter={letter}
              onUpdate={update}
              isLast={idx === (Object.keys(SECTION_TITLES).length - 1)}
            />
          ))}
        </div>

        {/* Footer: Preview + Save & close */}
        <footer
          style={{
            padding: '20px 32px',
            borderTop: '1px solid var(--ds-border-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'var(--ds-ink)',
              fontSize: 14,
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: 'var(--ds-font)',
              letterSpacing: '-0.005em',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--ds-purple)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--ds-ink)'}
          >
            <PreviewIcon /> Preview
          </button>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button className="ds-btn ds-btn-secondary ds-btn-sm" type="button">
              Save
            </button>
            <button className="ds-btn ds-btn-primary ds-btn-sm" type="button">
              Save &amp; close
            </button>
          </div>
        </footer>
      </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          PREVIEW (sticky)
          ═══════════════════════════════════════════════════════════ */}
      <aside
        className="motivation-preview-sticky"
        style={{
          position: 'sticky',
          top: 80,
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--ds-muted)',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
          }}
        >
          <span>Live preview</span>
          <span style={{ fontSize: 10, fontWeight: 500 }}>{percentUsed}% от лимита</span>
        </div>
        <MotivationPreview letter={letter} authorName={authorName} />
      </aside>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Section — один из 3 аккордеонов
   ═══════════════════════════════════════════════════════════════ */

function Section({
  sectionKey, open, onToggle, letter, onUpdate, isLast,
}: {
  sectionKey: SectionKey
  open: boolean
  onToggle: () => void
  letter: MotivationLetter
  onUpdate: <K extends keyof MotivationLetter>(key: K, value: string) => void
  isLast: boolean
}) {
  const questions = QUESTIONS[sectionKey]
  const title = SECTION_TITLES[sectionKey]
  const subtitle = SECTION_SUBTITLES[sectionKey]

  // Посчитать сколько вопросов заполнено
  const filled = questions.filter(q => (letter[q.key]?.length ?? 0) > 10).length

  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid var(--ds-border-soft)' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: '100%',
          padding: '18px 32px',
          background: 'transparent',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          cursor: 'pointer',
          fontFamily: 'var(--ds-font)',
          textAlign: 'left',
        }}
      >
        {/* Красный chevron как в скриншоте — > когда свёрнут, ⌄ когда раскрыт */}
        <span
          style={{
            color: 'var(--ds-error)',
            fontSize: 20,
            fontWeight: 700,
            display: 'inline-block',
            transform: open ? 'rotate(90deg)' : 'rotate(0)',
            transition: 'transform 220ms ease-out',
            width: 20,
            textAlign: 'center',
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          ›
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--ds-font)',
              fontSize: 17,
              fontWeight: 500,
              color: open ? 'var(--ds-info)' : 'var(--ds-ink)',
              letterSpacing: '-0.01em',
              lineHeight: 1.3,
              transition: 'color 120ms',
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 2, letterSpacing: '-0.005em' }}>
            {subtitle} · {filled} / {questions.length} заполнено
          </div>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--ds-muted)',
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}
        >
          {questions.reduce((acc, q) => acc + (letter[q.key]?.length ?? 0), 0)} сим.
        </span>
      </button>

      <div
        style={{
          maxHeight: open ? 10000 : 0,
          overflow: 'hidden',
          transition: 'max-height 360ms cubic-bezier(0.25, 0.1, 0.25, 1)',
        }}
      >
        <div style={{ padding: '4px 32px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {questions.map(q => (
            <QuestionField
              key={q.key}
              question={q}
              value={letter[q.key]}
              onChange={(v) => onUpdate(q.key, v)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   QuestionField — под-вопрос с лейблом, intro, textarea
   ═══════════════════════════════════════════════════════════════ */

function QuestionField({
  question, value, onChange,
}: {
  question: Question
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--ds-ink)',
          marginBottom: 6,
          letterSpacing: '-0.005em',
          lineHeight: 1.4,
        }}
      >
        {question.label}
      </label>
      {question.intro && (
        <p
          style={{
            fontSize: 13,
            color: 'var(--ds-ink-dim)',
            margin: '0 0 12px',
            lineHeight: 1.5,
            letterSpacing: '-0.005em',
          }}
        >
          {question.intro}
        </p>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={question.placeholder ?? 'Write your text here...'}
        rows={5}
        className="ds-input"
        style={{ resize: 'vertical', lineHeight: 1.55 }}
      />
      <div
        style={{
          marginTop: 6,
          fontSize: 11,
          color: 'var(--ds-muted)',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value.length} символов
      </div>
    </div>
  )
}

/* ─── Shared small pieces ─── */

function MenuButton() {
  return (
    <button
      type="button"
      aria-label="Меню"
      style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        border: '1.5px solid var(--ds-error)',
        background: 'transparent',
        color: 'var(--ds-error)',
        cursor: 'pointer',
        display: 'grid',
        placeItems: 'center',
        fontSize: 18,
        fontWeight: 700,
        lineHeight: 1,
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,59,48,0.08)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      ⋮
    </button>
  )
}

function PreviewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2h8l4 4v12H4z" />
      <path d="M12 2v4h4" />
      <line x1="7" y1="10" x2="13" y2="10" />
      <line x1="7" y1="13" x2="13" y2="13" />
    </svg>
  )
}

function EssayStatusBar({
  status, saveState, pending, onSubmit, isLocked,
}: {
  status: 'draft' | 'sent' | 'editing' | 'approved'
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  pending: boolean
  onSubmit: () => void
  isLocked: boolean
}) {
  const statusInfo: Record<string, { label: string; chip: string }> = {
    draft: { label: 'Черновик — только у тебя', chip: 'ds-chip-neutral' },
    sent: { label: 'Отправлено куратору', chip: 'ds-chip-info' },
    editing: { label: 'Куратор дорабатывает', chip: 'ds-chip-warning' },
    approved: { label: 'Готово ✓ Утверждено куратором', chip: 'ds-chip-success' },
  }
  const s = statusInfo[status]
  return (
    <div className="ds-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className={`ds-chip ${s.chip}`} style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10, fontWeight: 700 }}>{s.label}</span>
        {saveState === 'error' && (
          <span style={{ fontSize: 12, color: 'var(--ds-error)' }}>Не сохраняется — проверь что таблица client_essays создана</span>
        )}
      </div>
      {!isLocked && (
        <button type="button" className="ds-btn ds-btn-primary ds-btn-sm" onClick={onSubmit} disabled={pending}>
          {pending ? '…' : status === 'sent' || status === 'editing' ? 'Отправить ещё раз' : '↗ Отправить куратору'}
        </button>
      )}
    </div>
  )
}
