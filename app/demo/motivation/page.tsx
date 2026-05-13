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

  function updateField(key: keyof MotivationLetter, value: string) {
    setMotivation({ ...letter, [key]: value })
  }

  return (
    <>
      <DemoTopNav activePage="home" />

      <main style={{ maxWidth: 920, margin: '0 auto', padding: '24px 32px 80px' }}>
        <Link href="/demo" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ds-ink-dim)', textDecoration: 'none', marginBottom: 24 }}>
          ← Назад
        </Link>

        <header style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 32, letterSpacing: '0.02em', margin: 0 }}>
            Мотивационное письмо
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ds-ink-dim)', marginTop: 8 }}>
            Personal Statement по формату UCAS — 3 секции, лимит {MAX_CHARS} символов.
          </p>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              flex: 1, height: 6, borderRadius: 3, background: 'var(--ds-border-soft)', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', width: `${Math.min(100, (totalChars / MAX_CHARS) * 100)}%`,
                background: totalChars > MAX_CHARS ? 'var(--ds-red)' : 'var(--ds-purple)',
                transition: 'width .2s',
              }} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: totalChars > MAX_CHARS ? 'var(--ds-red)' : 'var(--ds-ink-dim)' }}>
              {totalChars} / {MAX_CHARS}
            </div>
          </div>
        </header>

        {SECTIONS.map(sec => (
          <section key={sec} style={{
            padding: '28px 32px', borderRadius: 16, background: 'var(--ds-surface)',
            border: '1px solid var(--ds-border-soft)', marginBottom: 20,
          }}>
            <div style={{ fontSize: 11, color: 'var(--ds-purple)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
              {SECTION_SUBTITLES[sec]}
            </div>
            <h2 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 20, margin: 0, marginBottom: 20 }}>
              {SECTION_TITLES[sec]}
            </h2>
            {QUESTIONS[sec].map(q => (
              <div key={q.key as string} style={{ marginBottom: 22 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ds-ink)', marginBottom: 6 }}>
                  {q.label}
                </label>
                {q.intro && (
                  <p style={{ fontSize: 12, color: 'var(--ds-ink-dim)', lineHeight: 1.5, margin: 0, marginBottom: 8 }}>
                    {q.intro}
                  </p>
                )}
                <textarea
                  value={(letter[q.key] as string) || ''}
                  onChange={(e) => updateField(q.key, e.target.value)}
                  placeholder={q.placeholder}
                  rows={5}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--ds-border-soft)', fontSize: 13, lineHeight: 1.5,
                    fontFamily: 'inherit', background: '#fff', resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ fontSize: 10, color: 'var(--ds-ink-dim)', marginTop: 4, textAlign: 'right' }}>
                  {((letter[q.key] as string) || '').length} символов
                </div>
              </div>
            ))}
          </section>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderRadius: 12, background: 'rgba(177,94,204,.06)', border: '1px solid var(--ds-purple)' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ds-ink)' }}>Готово отправить?</div>
            <div style={{ fontSize: 11, color: 'var(--ds-ink-dim)', marginTop: 2 }}>
              Куратор увидит письмо и подготовит финальную версию
            </div>
          </div>
          <button onClick={() => setMotivationStatus('sent')}
            style={{ padding: '12px 24px', borderRadius: 10, border: 'none', background: 'var(--ds-purple)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Отправить куратору
          </button>
        </div>

        {state.motivationStatus === 'sent' && (
          <div style={{ marginTop: 20, padding: 16, borderRadius: 8, background: 'rgba(22,163,97,.1)', color: 'var(--ds-green)', fontSize: 13, textAlign: 'center', fontWeight: 600 }}>
            ✓ Письмо отправлено куратору. Жди обратной связи.
          </div>
        )}
      </main>
    </>
  )
}
