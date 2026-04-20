'use client'

import { useState } from 'react'

interface Props {
  templates: any[]
}

const categoryLabel: Record<string, string> = {
  messages: 'ШАБЛОНЫ СООБЩЕНИЙ',
  designer: 'ТЗ ДЛЯ ДИЗАЙНЕРА',
}

export function TemplatesList({ templates }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function handleCopy(id: string, body: string) {
    try {
      await navigator.clipboard.writeText(body)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {}
  }

  // Group by category
  const grouped: Record<string, any[]> = {}
  templates.forEach(t => {
    const cat = t.category || 'other'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(t)
  })

  // Order: messages first, then designer
  const orderedCategories = ['messages', 'designer', ...Object.keys(grouped).filter(c => c !== 'messages' && c !== 'designer')]

  return (
    <div style={{ padding: '20px 24px', maxWidth: 800 }}>
      {orderedCategories.filter(cat => grouped[cat]).map(cat => {
        const items = grouped[cat]
        const isDesigner = cat === 'designer'

        return (
          <div key={cat} style={{ marginBottom: 32 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
              color: 'var(--purple)', marginBottom: 16,
            }}>
              {categoryLabel[cat] || cat}
            </div>

            {isDesigner ? (
              // Designer section — special layout
              items.map(t => {
                const isCopied = copiedId === t.id
                return (
                  <div key={t.id} style={{
                    background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 14,
                    padding: '20px 24px',
                  }}>
                    {t.usage_hint && (
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
                        {t.usage_hint.includes('@') ? (
                          <>
                            {t.usage_hint.split('@')[0]}
                            <span style={{ color: 'var(--purple)', fontWeight: 600 }}>@{t.usage_hint.split('@')[1].split(' ')[0]}</span>
                            {' '}{t.usage_hint.split('@')[1].split(' ').slice(1).join(' ')}
                          </>
                        ) : t.usage_hint}
                      </div>
                    )}
                    <div style={{
                      padding: '16px 20px', borderRadius: 10, background: 'var(--bg)',
                      border: '1px solid var(--bor)', fontSize: 13, lineHeight: 1.8,
                      color: 'var(--text)', whiteSpace: 'pre-wrap',
                    }}>
                      {t.body}
                    </div>
                    <button
                      onClick={() => handleCopy(t.id, t.body)}
                      style={{
                        marginTop: 12, padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: isCopied ? 'rgba(22,163,97,.1)' : 'rgba(177,94,204,.08)',
                        color: isCopied ? 'var(--green)' : 'var(--purple)',
                        border: `1px solid ${isCopied ? 'rgba(22,163,97,.2)' : 'rgba(177,94,204,.2)'}`,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                      {isCopied ? 'Скопировано' : 'Скопировать ТЗ'}
                    </button>
                  </div>
                )
              })
            ) : (
              // Messages section — numbered cards with expand/collapse
              <div style={{ display: 'grid', gap: 16 }}>
                {items.map((t, i) => {
                  const isCopied = copiedId === t.id
                  const isExpanded = expandedId === t.id
                  const num = String(i + 1).padStart(2, '0')

                  return (
                    <div key={t.id} style={{
                      background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 14,
                      overflow: 'hidden',
                    }}>
                      {/* Header — always visible */}
                      <div
                        onClick={() => setExpandedId(isExpanded ? null : t.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
                          cursor: 'pointer',
                        }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                          background: 'rgba(177,94,204,.08)', color: 'var(--purple)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 14, fontWeight: 700,
                        }}>
                          {num}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t.title}</div>
                          {t.usage_hint && (
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{t.usage_hint}</div>
                          )}
                        </div>
                        <svg viewBox="0 0 12 12" fill="none" stroke="var(--muted)" strokeWidth="1.5" width="14" height="14"
                          style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}>
                          <path d="M2 4l4 4 4-4" />
                        </svg>
                      </div>

                      {/* Body — collapsible */}
                      {isExpanded && (
                        <div style={{ padding: '0 20px 16px' }}>
                          <div style={{
                            padding: '16px 20px', borderRadius: 10, background: 'var(--bg)',
                            border: '1px solid var(--bor)', fontSize: 13, lineHeight: 1.8,
                            color: 'var(--text)', whiteSpace: 'pre-wrap',
                          }}>
                            {t.body}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCopy(t.id, t.body) }}
                            style={{
                              marginTop: 10, padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                              background: isCopied ? 'rgba(22,163,97,.1)' : 'rgba(177,94,204,.08)',
                              color: isCopied ? 'var(--green)' : 'var(--purple)',
                              border: `1px solid ${isCopied ? 'rgba(22,163,97,.2)' : 'rgba(177,94,204,.2)'}`,
                              cursor: 'pointer', fontFamily: 'inherit',
                            }}>
                            {isCopied ? 'Скопировано' : 'Скопировать'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Separator between sections */}
            {cat !== orderedCategories[orderedCategories.length - 1] && (
              <div style={{ borderBottom: '1px solid var(--bor)', marginTop: 32 }} />
            )}
          </div>
        )
      })}

      {templates.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
          Нет шаблонов
        </div>
      )}
    </div>
  )
}
