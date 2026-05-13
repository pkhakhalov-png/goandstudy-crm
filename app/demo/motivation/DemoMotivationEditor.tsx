'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import {
  INITIAL_LETTER,
  MAX_CHARS,
  QUESTIONS,
  SECTION_TITLES,
  SECTION_SUBTITLES,
  type MotivationLetter,
  type SectionKey,
  type Question,
} from '@/app/client/motivation/mock'
import { MotivationPreview } from '@/app/client/motivation/MotivationPreview'
import { useDemoState } from '../DemoState'

interface Props {
  authorName: string
}

export function DemoMotivationEditor({ authorName }: Props) {
  const { state, setMotivation, setMotivationStatus } = useDemoState()
  const [letter, setLetter] = useState<MotivationLetter>(state.motivation || INITIAL_LETTER)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLocked = state.motivationStatus === 'ready'

  useEffect(() => {
    if (isLocked) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = setTimeout(() => {
      setMotivation(letter)
      setSaveState('saved')
    }, 600)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letter, isLocked])

  function handleReset() {
    if (!confirm('Сбросить письмо к образцу? Текущий черновик пропадёт.')) return
    setLetter(INITIAL_LETTER)
  }

  function handleDownloadPdf() {
    window.print()
  }

  function handleSubmit() {
    setMotivation(letter)
    setMotivationStatus('sent')
    alert('Письмо отправлено куратору ✓')
  }

  const [openSection, setOpenSection] = useState<SectionKey | null>('course')

  const charsUsed = useMemo(() => {
    return Object.values(letter).reduce((sum, v) => sum + (v?.length ?? 0), 0)
  }, [letter])
  const remaining = Math.max(0, MAX_CHARS - charsUsed)
  const percentUsed = Math.min(100, Math.round((charsUsed / MAX_CHARS) * 100))

  function update<K extends keyof MotivationLetter>(key: K, value: string) {
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <EssayStatusBar
          status={state.motivationStatus === 'ready' ? 'approved' : state.motivationStatus === 'editing' ? 'editing' : state.motivationStatus === 'sent' ? 'sent' : 'draft'}
          saveState={saveState}
          onSubmit={handleSubmit}
          onReset={handleReset}
          onDownloadPdf={handleDownloadPdf}
          isLocked={isLocked}
        />
        <div className="ds-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <header
            style={{
              padding: '28px 32px 24px',
              borderBottom: '1px solid var(--ds-border-soft)',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              gap: 16, flexWrap: 'wrap',
            }}
          >
            <div>
              <h2 style={{
                fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700,
                fontSize: 'clamp(24px, 2.8vw, 36px)', letterSpacing: '0.02em',
                textTransform: 'uppercase', lineHeight: 1, margin: 0,
              }}>
                Personal statement<br />builder
              </h2>
              <div style={{ fontSize: 13, color: 'var(--ds-muted)', marginTop: 10, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.005em' }}>
                <span style={{ fontWeight: 600, color: remaining < 500 ? 'var(--ds-error)' : 'var(--ds-ink)' }}>
                  {remaining}
                </span>{' '}
                из <span className="ds-mono">{MAX_CHARS}</span> символов осталось
              </div>
              <div style={{ marginTop: 12, width: 'min(320px, 100%)', height: 4, background: 'var(--ds-bg-alt)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  width: `${percentUsed}%`, height: '100%',
                  background: percentUsed > 90 ? 'var(--ds-error)' : percentUsed > 70 ? 'var(--ds-amber)' : 'var(--ds-purple)',
                  transition: 'width 200ms ease-out, background 200ms',
                }} />
              </div>
            </div>
            <button type="button" aria-label="Меню"
              style={{ width: 40, height: 40, borderRadius: '50%', border: '1.5px solid var(--ds-error)', background: 'transparent', color: 'var(--ds-error)', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>
              ⋮
            </button>
          </header>

          <div style={{ padding: '20px 32px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ds-muted)' }}>
              Имя автора (как подписать письмо)
            </label>
            <input
              type="text"
              value={letter.authorName ?? ''}
              onChange={(e) => setLetter(l => ({ ...l, authorName: e.target.value }))}
              placeholder={authorName || 'Name Lastname'}
              className="ds-input"
              style={{ fontSize: 15 }}
            />
          </div>

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
        </div>
      </div>

      <aside className="motivation-preview-sticky" style={{ position: 'sticky', top: 80, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ds-muted)', marginBottom: 10, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span>Live preview</span>
          <span style={{ fontSize: 10, fontWeight: 500 }}>{percentUsed}% от лимита</span>
        </div>
        <MotivationPreview letter={letter} authorName={letter.authorName?.trim() || authorName} />
      </aside>
    </div>
  )
}

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
  const filled = questions.filter(q => (letter[q.key]?.length ?? 0) > 10).length

  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid var(--ds-border-soft)' }}>
      <button
        type="button" onClick={onToggle} aria-expanded={open}
        style={{
          width: '100%', padding: '18px 32px', background: 'transparent', border: 'none',
          display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
          fontFamily: 'var(--ds-font)', textAlign: 'left',
        }}
      >
        <span style={{
          color: 'var(--ds-error)', fontSize: 20, fontWeight: 700,
          display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0)',
          transition: 'transform 220ms ease-out', width: 20, textAlign: 'center', flexShrink: 0, lineHeight: 1,
        }}>›</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--ds-font)', fontSize: 17, fontWeight: 500, color: open ? 'var(--ds-info)' : 'var(--ds-ink)', letterSpacing: '-0.01em', lineHeight: 1.3, transition: 'color 120ms' }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 2, letterSpacing: '-0.005em' }}>
            {subtitle} · {filled} / {questions.length} заполнено
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ds-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {questions.reduce((acc, q) => acc + (letter[q.key]?.length ?? 0), 0)} сим.
        </span>
      </button>

      <div style={{ maxHeight: open ? 10000 : 0, overflow: 'hidden', transition: 'max-height 360ms cubic-bezier(0.25, 0.1, 0.25, 1)' }}>
        <div style={{ padding: '4px 32px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {questions.map(q => (
            <QuestionField key={q.key} question={q} value={letter[q.key] ?? ''} onChange={(v) => onUpdate(q.key, v)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function QuestionField({ question, value, onChange }: { question: Question; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--ds-ink)', marginBottom: 6, letterSpacing: '-0.005em', lineHeight: 1.4 }}>
        {question.label}
      </label>
      {question.intro && (
        <p style={{ fontSize: 13, color: 'var(--ds-ink-dim)', margin: '0 0 12px', lineHeight: 1.5, letterSpacing: '-0.005em' }}>
          {question.intro}
        </p>
      )}
      <textarea
        value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={question.placeholder ?? 'Write your text here...'}
        rows={5} className="ds-input"
        style={{ resize: 'vertical', lineHeight: 1.55 }}
      />
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--ds-muted)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {value.length} символов
      </div>
    </div>
  )
}

function EssayStatusBar({
  status, saveState, onSubmit, onReset, onDownloadPdf, isLocked,
}: {
  status: 'draft' | 'sent' | 'editing' | 'approved'
  saveState: 'idle' | 'saving' | 'saved'
  onSubmit: () => void
  onReset: () => void
  onDownloadPdf: () => void
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
        {status !== 'draft' && (
          <span className={`ds-chip ${s.chip}`} style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10, fontWeight: 700 }}>{s.label}</span>
        )}
        {saveState === 'saving' && (
          <span style={{ fontSize: 11, color: 'var(--ds-muted)' }}>Сохраняем…</span>
        )}
        {saveState === 'saved' && status === 'draft' && (
          <span style={{ fontSize: 11, color: 'var(--ds-muted)' }}>Сохранено</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={onDownloadPdf} className="ds-btn ds-btn-secondary ds-btn-sm" title="Открыть в виде для печати">
          ↓ Скачать PDF
        </button>
        <button type="button" onClick={onReset}
          style={{ background: 'transparent', border: '1px solid var(--ds-border)', color: 'var(--ds-muted)', fontSize: 12, padding: '6px 12px', borderRadius: 'var(--ds-r-sm)', cursor: 'pointer' }}
          title="Стереть всё и подгрузить пример">
          ↻ К образцу
        </button>
        {!isLocked && (
          <button type="button" className="ds-btn ds-btn-primary ds-btn-sm" onClick={onSubmit}>
            {status === 'sent' || status === 'editing' ? 'Отправить ещё раз' : '↗ Отправить куратору'}
          </button>
        )}
      </div>
    </div>
  )
}
