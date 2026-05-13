'use client'

import Link from 'next/link'
import { DemoTopNav } from '../DemoTopNav'
import { useDemoState } from '../DemoState'
import { QUESTIONS, SECTION_TITLES, SECTION_SUBTITLES, MAX_CHARS, type MotivationLetter, type SectionKey } from '@/app/client/motivation/mock'

const SECTIONS: SectionKey[] = ['course', 'skills', 'work']

export default function DemoMotivationPage() {
  const { state, ready, setMotivation, setMotivationStatus } = useDemoState()
  if (!ready) return null

  const letter = state.motivation
  const totalChars = Object.entries(letter)
    .filter(([k]) => k !== 'authorName')
    .reduce((sum, [, v]) => sum + (typeof v === 'string' ? v.length : 0), 0)
  const percentUsed = Math.min(100, Math.round((totalChars / MAX_CHARS) * 100))

  function updateField(key: keyof MotivationLetter, value: string) {
    setMotivation({ ...letter, [key]: value })
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg)' }}>
      <DemoTopNav activePage="home" />

      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--ds-border-soft)', background: 'var(--ds-bg)' }}>
        <div aria-hidden style={{ position: 'absolute', top: '-30%', right: '-10%', width: 900, height: 500, background: 'radial-gradient(ellipse at center, rgba(232,184,68,0.14) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div aria-hidden style={{ position: 'absolute', top: '-20%', left: '-10%', width: 800, height: 400, background: 'radial-gradient(ellipse at center, rgba(181,127,207,0.14) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 1400, margin: '0 auto', padding: '40px 32px 32px' }}>
          <Link href="/demo" style={{
            fontSize: 12, color: 'var(--ds-purple)', fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10,
          }}>
            ← Вернуться в кабинет
          </Link>
          <h1 style={{
            fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700,
            fontSize: 'clamp(32px, 4vw, 52px)', letterSpacing: '0.02em', lineHeight: 1,
            margin: '0 0 10px 0', textTransform: 'uppercase',
          }}>
            Мотивационное <span className="ds-hl">письмо</span>
          </h1>
          <p style={{ fontSize: 15, color: 'var(--ds-ink-dim)', maxWidth: 680, lineHeight: 1.5, margin: 0 }}>
            Заполни три секции по шаблону UCAS Personal Statement. Максимум — 4000 символов суммарно.
            Когда будет готово, куратор поможет довести до финальной версии.
          </p>
        </div>
      </section>

      <main style={{ maxWidth: 920, margin: '0 auto', padding: '32px 32px 80px' }}>
        {/* Char counter sticky */}
        <div style={{
          position: 'sticky', top: 16, zIndex: 5, marginBottom: 24,
          padding: '14px 18px', borderRadius: 'var(--ds-r-md)',
          background: 'var(--ds-bg)', border: '1px solid var(--ds-border-soft)',
          boxShadow: 'var(--ds-sh-sm)',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--ds-bg-alt)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${percentUsed}%`,
              background: totalChars > MAX_CHARS ? 'var(--ds-error)' : 'var(--ds-purple)',
              transition: 'width .2s',
            }} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: totalChars > MAX_CHARS ? 'var(--ds-error)' : 'var(--ds-ink)', fontVariantNumeric: 'tabular-nums' }}>
            {totalChars} / {MAX_CHARS}
          </div>
        </div>

        {SECTIONS.map(sec => (
          <section key={sec} className="ds-card" style={{ padding: '28px 32px', marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--ds-purple)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
              {SECTION_SUBTITLES[sec]}
            </div>
            <h2 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 24, textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0, marginBottom: 20 }}>
              {SECTION_TITLES[sec]}
            </h2>
            {QUESTIONS[sec].map(q => (
              <div key={q.key as string} style={{ marginBottom: 22 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ds-ink)', marginBottom: 6 }}>
                  {q.label}
                </label>
                {q.intro && (
                  <p style={{ fontSize: 12, color: 'var(--ds-muted)', lineHeight: 1.5, margin: 0, marginBottom: 8 }}>
                    {q.intro}
                  </p>
                )}
                <textarea
                  value={(letter[q.key] as string) || ''}
                  onChange={(e) => updateField(q.key, e.target.value)}
                  placeholder={q.placeholder}
                  rows={5}
                  className="ds-input"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--ds-r-md)', border: '1px solid var(--ds-border)', fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit', background: '#fff', resize: 'vertical', boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: 10, color: 'var(--ds-muted)', marginTop: 4, textAlign: 'right' }}>
                  {((letter[q.key] as string) || '').length} символов
                </div>
              </div>
            ))}
          </section>
        ))}

        <div className="ds-card" style={{ padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: 'var(--ds-purple)' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ds-ink)' }}>Готово отправить?</div>
            <div style={{ fontSize: 12, color: 'var(--ds-muted)', marginTop: 2 }}>
              Куратор увидит письмо и подготовит финальную версию
            </div>
          </div>
          <button onClick={() => setMotivationStatus('sent')}
            className="ds-btn ds-btn-primary"
            style={{ padding: '12px 24px', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Отправить куратору
          </button>
        </div>

        {state.motivationStatus === 'sent' && (
          <div style={{ marginTop: 16, padding: 16, borderRadius: 'var(--ds-r-md)', background: 'var(--ds-success-soft)', color: 'var(--ds-success-ink)', fontSize: 13, textAlign: 'center', fontWeight: 600 }}>
            ✓ Письмо отправлено куратору. Жди обратной связи.
          </div>
        )}
      </main>
    </div>
  )
}
