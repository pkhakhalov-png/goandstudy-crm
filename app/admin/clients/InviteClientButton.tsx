'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { generateClientInviteAction, resendClientInviteAction } from './actions'

interface Props {
  client: { id: number; email: string | null; name: string | null }
}

export function InviteClientButton({ client }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [sentTo, setSentTo] = useState<string>(client.email || '')
  const [editingEmail, setEditingEmail] = useState(false)
  const [resendDraft, setResendDraft] = useState('')
  const [resending, setResending] = useState(false)

  async function generate() {
    setLoading(true); setError(null)
    const res = await generateClientInviteAction(client.id)
    setLoading(false)
    if (!res.success) {
      setError(res.error || 'Не удалось создать ссылку')
      return
    }
    setUrl(res.url!)
    setEmailSent(!!res.emailSent)
    setEmailError(res.emailError)
    setSentTo(client.email || '')
    setOpen(true)
  }

  async function resend(newEmail: string) {
    const trimmed = newEmail.trim()
    if (!trimmed) return
    setResending(true); setError(null)
    const res = await resendClientInviteAction(client.id, trimmed)
    setResending(false)
    if (!res.success) { setError(res.error || 'Не удалось переотправить'); return }
    setUrl(res.url!)
    setEmailSent(!!res.emailSent)
    setEmailError(res.emailError)
    setSentTo(trimmed)
    setEditingEmail(false)
    router.refresh()
  }

  async function copy() {
    if (!url) return
    try { await navigator.clipboard.writeText(url) } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!client.email) {
    return (
      <div style={{
        marginTop: 14, padding: '10px 12px',
        background: 'rgba(138,135,150,.08)', borderRadius: 8,
        fontSize: 12, color: '#8a8796', lineHeight: 1.4,
      }}>
        Чтобы выслать ссылку на кабинет — заполни email клиента в карточке.
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={generate}
        disabled={loading}
        style={{
          marginTop: 14, padding: '10px 14px',
          background: '#B15ECC', color: '#fff',
          border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 600,
          cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          width: '100%', justifyContent: 'center',
        }}
      >
        🔗 {loading ? 'Создаём…' : 'Ссылка для активации кабинета'}
      </button>
      {error && (
        <div style={{
          marginTop: 8, padding: '8px 12px',
          background: 'rgba(220,53,69,.08)', border: '1px solid rgba(220,53,69,.2)',
          borderRadius: 8, fontSize: 12, color: 'var(--red)',
        }}>
          {error}
        </div>
      )}

      {open && url && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(20,18,30,.55)', backdropFilter: 'blur(8px)',
            display: 'grid', placeItems: 'center', padding: 24,
          }}
        >
          <div style={{
            background: '#fff', borderRadius: 18, maxWidth: 520, width: '100%',
            padding: 32, boxShadow: '0 24px 60px rgba(20,18,30,.25)',
            fontFamily: '-apple-system, sans-serif',
          }}>
            <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 8 }}>🔗</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', textAlign: 'center' }}>
              Ссылка для активации кабинета
            </h2>
            <p style={{ fontSize: 13, color: '#8a8796', textAlign: 'center', margin: '0 0 20px', lineHeight: 1.5 }}>
              Срок 30 дней.
            </p>

            <div style={{
              display: 'flex', gap: 6, marginBottom: 12,
              background: '#F9F8FC', border: '1px solid rgba(0,0,0,.08)',
              borderRadius: 10, padding: 6,
            }}>
              <input
                type="text" value={url} readOnly
                onFocus={e => e.currentTarget.select()}
                style={{
                  flex: 1, fontSize: 12, fontFamily: 'monospace',
                  padding: '8px 10px', border: 'none', outline: 'none',
                  background: 'transparent', color: '#14121e',
                }}
              />
              <button
                type="button" onClick={copy}
                style={{
                  padding: '8px 16px', fontSize: 12, fontWeight: 600,
                  background: copied ? '#16a361' : '#B15ECC', color: '#fff',
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                  fontFamily: 'inherit', whiteSpace: 'nowrap',
                }}
              >
                {copied ? '✓ Скопировано' : 'Копировать'}
              </button>
            </div>

            <div style={{
              padding: '10px 14px',
              background: emailSent ? 'rgba(22,163,97,.08)' : 'rgba(255,193,7,.08)',
              border: `1px solid ${emailSent ? 'rgba(22,163,97,.25)' : 'rgba(255,193,7,.3)'}`,
              borderRadius: 8, fontSize: 12, lineHeight: 1.5, marginBottom: 16,
            }}>
              {emailSent
                ? `✓ Email с ссылкой отправлен на ${sentTo}`
                : `⚠ Email не отправлен${emailError ? ` (${emailError})` : ''} — скопируй ссылку и пошли через TG/WhatsApp`}
            </div>

            {/* Поправить email и переотправить */}
            {!editingEmail ? (
              <button type="button"
                onClick={() => { setEditingEmail(true); setResendDraft(sentTo); setError(null) }}
                style={{
                  display: 'block', margin: '0 0 16px', padding: 0,
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: '#B15ECC',
                }}>
                ✏️ Неверный email? Поправить и переотправить
              </button>
            ) : (
              <div style={{
                marginBottom: 16, padding: 12,
                background: '#F9F8FC', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
              }}>
                <div style={{ fontSize: 11, color: '#8a8796', fontWeight: 600, marginBottom: 6 }}>
                  Правильный email клиента
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="email"
                    value={resendDraft}
                    onChange={e => setResendDraft(e.target.value)}
                    placeholder="client@example.com"
                    autoFocus
                    style={{
                      flex: 1, padding: '9px 12px', fontSize: 13,
                      border: '1px solid rgba(0,0,0,.12)', borderRadius: 8,
                      fontFamily: 'inherit', outline: 'none', color: '#14121e', background: '#fff',
                    }}
                  />
                  <button type="button"
                    onClick={() => resend(resendDraft)}
                    disabled={resending || !resendDraft.trim()}
                    style={{
                      padding: '9px 16px', fontSize: 12, fontWeight: 600,
                      background: resending || !resendDraft.trim() ? '#d2c4dc' : '#B15ECC', color: '#fff',
                      border: 'none', borderRadius: 8, whiteSpace: 'nowrap',
                      cursor: resending || !resendDraft.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                    }}>
                    {resending ? 'Шлём…' : 'Переотправить'}
                  </button>
                </div>
                {error && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#dc3545' }}>{error}</div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button" onClick={() => setOpen(false)}
                style={{
                  padding: '10px 20px', fontSize: 13, fontWeight: 600,
                  background: '#14121e', color: '#fff',
                  border: 'none', borderRadius: 10, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
