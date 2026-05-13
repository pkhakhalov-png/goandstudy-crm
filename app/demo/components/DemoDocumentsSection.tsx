'use client'

import { useRef } from 'react'
import { useDemoState } from '../DemoState'
import { DEMO_REQUIRED_DOCS } from '../data'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  uploaded: { label: 'Загружено', color: 'var(--ds-green)' },
  pending:  { label: 'У куратора', color: 'var(--ds-purple)' },
  missing:  { label: 'Нужно загрузить', color: 'var(--ds-amber)' },
  locked:   { label: 'Будет открыто', color: 'var(--ds-ink-dim)' },
}

export function DemoDocumentsSection() {
  const { state, uploadDoc, removeDoc } = useDemoState()
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  return (
    <section>
      <header style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 22, letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0 }}>
          Документы
        </h2>
        <p style={{ fontSize: 12, color: 'var(--ds-ink-dim)', marginTop: 4, letterSpacing: '0.04em' }}>
          Загружай сканы — куратор увидит и проверит. Файлы хранятся только в этой вкладке.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {DEMO_REQUIRED_DOCS.map(doc => {
          const uploaded = state.uploadedDocs[doc.key]
          const effectiveStatus = uploaded ? 'uploaded' : doc.status
          const badge = STATUS_LABEL[effectiveStatus] || STATUS_LABEL.missing

          return (
            <div key={doc.key} style={{
              padding: 16, borderRadius: 12,
              background: 'var(--ds-surface)',
              border: '1px solid var(--ds-border-soft)',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ds-ink)' }}>
                  {doc.title}
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  background: badge.color + '15', color: badge.color,
                  padding: '3px 8px', borderRadius: 4, flexShrink: 0,
                }}>
                  {badge.label}
                </span>
              </div>

              {uploaded ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(22,163,97,.06)', borderRadius: 8 }}>
                  <span style={{ fontSize: 14 }}>📎</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ds-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {uploaded.fileName}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--ds-ink-dim)' }}>{uploaded.fileSize}</div>
                  </div>
                  <button
                    onClick={() => removeDoc(doc.key)}
                    style={{ fontSize: 10, color: 'var(--ds-red)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  {doc.hint && (
                    <div style={{ fontSize: 11, color: 'var(--ds-ink-dim)', lineHeight: 1.4 }}>{doc.hint}</div>
                  )}
                  {doc.status !== 'locked' && (
                    <>
                      <input
                        type="file"
                        ref={(el) => { fileInputs.current[doc.key] = el }}
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) uploadDoc(doc.key, file)
                        }}
                      />
                      <button
                        onClick={() => fileInputs.current[doc.key]?.click()}
                        style={{
                          padding: '8px 14px', borderRadius: 8, border: '1px solid var(--ds-purple)',
                          background: 'transparent', color: 'var(--ds-purple)',
                          fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                          cursor: 'pointer',
                        }}
                      >
                        Загрузить файл
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
