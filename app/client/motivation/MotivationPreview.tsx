'use client'

import type { MotivationLetter } from './mock'

interface Props {
  letter: MotivationLetter
  authorName: string
}

/* Read-only превью письма. Рендерим как документ A4-пропорций:
   заголовок, секции, абзацы. Обновляется на лету. */

export function MotivationPreview({ letter, authorName }: Props) {
  const paras: Array<{ heading?: string; body: string }> = [
    { body: letter.whyApplying },
    { body: letter.whyInterest },
    { body: letter.whySuitable },
    { body: letter.studiesRelated },
    { heading: 'Skills and achievements', body: [letter.skills, letter.otherAchievements].filter(Boolean).join('\n\n') },
    { heading: 'Work experience & future plans', body: [letter.workExperience, letter.futurePlans].filter(Boolean).join('\n\n') },
  ].filter(p => p.body.trim().length > 0)

  const isEmpty = paras.length === 0

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid var(--ds-border)',
        borderRadius: 'var(--ds-r-lg)',
        boxShadow: 'var(--ds-sh-md)',
        overflow: 'hidden',
        fontFamily: 'var(--ds-font)',
        color: '#1D1D1F',
      }}
    >
      <div style={{ padding: '48px 40px' }}>
        {/* Header */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#888',
            marginBottom: 12,
          }}
        >
          Personal statement
        </div>
        <h1
          style={{
            fontFamily: 'var(--ds-font-display-stack)',
            fontWeight: 700,
            fontSize: 'clamp(22px, 2.3vw, 30px)',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            lineHeight: 1,
            margin: '0 0 6px 0',
          }}
        >
          {authorName || 'Ваше имя'}
        </h1>
        <div style={{ fontSize: 12, color: '#555', marginBottom: 24 }}>
          Подано в Go &amp; Study · черновик
        </div>
        <div style={{ height: 1, background: '#E5E5E7', marginBottom: 28 }} />

        {/* Body */}
        {isEmpty ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: 'var(--ds-muted)',
              fontSize: 13,
              fontStyle: 'italic',
              background: 'var(--ds-bg-alt)',
              borderRadius: 'var(--ds-r-md)',
            }}
          >
            Пусто. Начните заполнять секции слева — письмо появится здесь в реальном времени.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {paras.map((p, idx) => (
              <div key={idx}>
                {p.heading && (
                  <h3
                    style={{
                      fontFamily: 'var(--ds-font-display-stack)',
                      fontWeight: 700,
                      fontSize: 12,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: '#111',
                      margin: '8px 0 8px',
                    }}
                  >
                    {p.heading}
                  </h3>
                )}
                <p
                  style={{
                    fontSize: 13,
                    lineHeight: 1.65,
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                    color: '#1D1D1F',
                  }}
                >
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
