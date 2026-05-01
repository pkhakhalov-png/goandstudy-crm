'use client'

import { useState } from 'react'
import { generateCuratorInviteAction } from './actions'

export function CuratorInviteButton({ curatorId, curatorName, hasEmail, hasUserId }: {
  curatorId: string
  curatorName: string
  hasEmail: boolean
  hasUserId: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (hasUserId) {
    return <span style={{ fontSize: 11, color: '#16a361', fontWeight: 600 }}>✓ Активирован</span>
  }
  if (!hasEmail) {
    return <span style={{ fontSize: 11, color: '#8a8796', fontStyle: 'italic' }}>Заполни email</span>
  }

  async function generate() {
    setLoading(true); setError(null)
    const res = await generateCuratorInviteAction(curatorId)
    setLoading(false)
    if (!res.success) { setError(res.error || 'Ошибка'); return }
    setUrl(res.url!)
    setEmailSent(!!res.emailSent)
    setEmailError(res.emailError)
    setOpen(true)
  }

  async function copy() {
    if (!url) return
    try { await navigator.clipboard.writeText(url) } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <button type="button" onClick={generate} disabled={loading}
        style={{
          padding: '5px 12px', background: '#fff',
          border: '1px solid #B15ECC', borderRadius: 7,
          fontSize: 11, fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
          color: '#B15ECC', fontFamily: 'inherit',
        }}>
        {loading ? '…' : '🔗 Ссылка входа'}
      </button>
      {error && (
        <div style={{ marginTop: 6, padding: '4px 8px', fontSize: 10, color: '#dc3545' }}>
          {error}
        </div>
      )}

      {open && url && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(20,18,30,.55)', backdropFilter: 'blur(8px)',
            display: 'grid', placeItems: 'center', padding: 24,
          }}>
          <div style={{
            background: '#fff', borderRadius: 18, maxWidth: 520, width: '100%',
            padding: 32, boxShadow: '0 24px 60px rgba(20,18,30,.25)',
            fontFamily: '-apple-system, sans-serif',
          }}>
            <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 8 }}>🔗</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', textAlign: 'center', color: '#14121e' }}>
              Ссылка входа куратора
            </h2>
            <p style={{ fontSize: 13, color: '#8a8796', textAlign: 'center', margin: '0 0 20px', lineHeight: 1.5 }}>
              Для <b>{curatorName}</b>. Срок 30 дней. Ссылка одноразовая.
            </p>

            <div style={{
              display: 'flex', gap: 6, marginBottom: 12,
              background: '#F9F8FC', border: '1px solid rgba(0,0,0,.08)',
              borderRadius: 10, padding: 6,
            }}>
              <input type="text" value={url} readOnly onFocus={e => e.currentTarget.select()}
                style={{
                  flex: 1, fontSize: 12, fontFamily: 'monospace',
                  padding: '8px 10px', border: 'none', outline: 'none',
                  background: 'transparent', color: '#14121e',
                }}
              />
              <button type="button" onClick={copy}
                style={{
                  padding: '8px 16px', fontSize: 12, fontWeight: 600,
                  background: copied ? '#16a361' : '#B15ECC', color: '#fff',
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                  fontFamily: 'inherit', whiteSpace: 'nowrap',
                }}>
                {copied ? '✓ Скопировано' : 'Копировать'}
              </button>
            </div>

            <div style={{
              padding: '10px 14px',
              background: emailSent ? 'rgba(22,163,97,.08)' : 'rgba(255,193,7,.08)',
              border: `1px solid ${emailSent ? 'rgba(22,163,97,.25)' : 'rgba(255,193,7,.3)'}`,
              borderRadius: 8, fontSize: 12, lineHeight: 1.5, marginBottom: 16,
            }}>
              {emailSent ? '✓ Email с ссылкой отправлен куратору' : `⚠ Email не отправлен${emailError ? ` (${emailError})` : ''} — отправь ссылку вручную`}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setOpen(false)}
                style={{
                  padding: '10px 20px', fontSize: 13, fontWeight: 600,
                  background: '#14121e', color: '#fff',
                  border: 'none', borderRadius: 10, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}>
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
