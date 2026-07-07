'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { generateInviteForOwnClient, setClientEmail, resendInviteForOwnClient } from './actions'

interface Props {
  clientId: number
  clientEmail: string | null
  /** Если у клиента нет email, попытаемся подставить отсюда (например из сделки) и сохранить. */
  fallbackEmail?: string | null
  clientName: string | null
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'asking-email' }
  | { kind: 'showing'; url: string; email: string; emailSent: boolean; emailError?: string }

export function SalesInviteButton({ clientId, clientEmail, fallbackEmail, clientName }: Props) {
  const router = useRouter()
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const [emailDraft, setEmailDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [editingEmail, setEditingEmail] = useState(false)
  const [resendDraft, setResendDraft] = useState('')
  const [resending, setResending] = useState(false)

  async function generate(emailOverride?: string) {
    // Email берём по приоритету: явный override → email клиента → fallback (например из сделки)
    const emailToUse = emailOverride || clientEmail || fallbackEmail
    if (!emailToUse) { setState({ kind: 'asking-email' }); return }
    setState({ kind: 'loading' }); setError(null)
    // Если email клиента ещё не сохранён в БД — сохраняем (override или fallback)
    if (emailOverride || (!clientEmail && fallbackEmail)) {
      const r = await setClientEmail(clientId, emailToUse)
      if (!r.success) { setError(r.error || 'Не удалось сохранить email'); setState({ kind: 'asking-email' }); return }
    }
    const res = await generateInviteForOwnClient(clientId)
    if (!res.success) {
      setError(res.error || 'Не удалось создать ссылку')
      setState({ kind: 'idle' })
      return
    }
    setState({ kind: 'showing', url: res.url!, email: emailToUse, emailSent: !!res.emailSent, emailError: res.emailError })
    if (emailOverride || (!clientEmail && fallbackEmail)) router.refresh()
  }

  // Поправить email и переотправить письмо (когда email указан с ошибкой).
  async function resend(newEmail: string) {
    const trimmed = newEmail.trim()
    if (!trimmed) return
    setResending(true); setError(null)
    const res = await resendInviteForOwnClient(clientId, trimmed)
    setResending(false)
    if (!res.success) { setError(res.error || 'Не удалось переотправить'); return }
    setState({ kind: 'showing', url: res.url!, email: trimmed, emailSent: !!res.emailSent, emailError: res.emailError })
    setEditingEmail(false)
    router.refresh()
  }

  async function copy() {
    if (state.kind !== 'showing') return
    try { await navigator.clipboard.writeText(state.url) } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function close() {
    setState({ kind: 'idle' })
    setEmailDraft('')
    setError(null)
    setEditingEmail(false)
    setResendDraft('')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => generate()}
        disabled={state.kind === 'loading'}
        style={{
          margin: '14px 0', padding: '10px 14px', width: '100%',
          background: '#B15ECC', color: '#fff',
          border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 600,
          cursor: state.kind === 'loading' ? 'wait' : 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        🔗 {state.kind === 'loading' ? 'Создаём…' : 'Ссылка для активации кабинета'}
      </button>
      {error && state.kind !== 'asking-email' && (
        <div style={{
          marginBottom: 10, padding: '8px 12px',
          background: 'rgba(220,53,69,.08)', border: '1px solid rgba(220,53,69,.2)',
          borderRadius: 8, fontSize: 11, color: 'var(--red)',
        }}>
          {error}
        </div>
      )}

      {/* Модалка ввода email если его нет */}
      {state.kind === 'asking-email' && (
        <div onClick={(e) => { if (e.target === e.currentTarget) close() }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(20,18,30,.55)', backdropFilter: 'blur(8px)',
            display: 'grid', placeItems: 'center', padding: 24,
          }}>
          <div style={{
            background: '#fff', borderRadius: 18, maxWidth: 420, width: '100%',
            padding: 32, boxShadow: '0 24px 60px rgba(20,18,30,.25)',
            fontFamily: '-apple-system, sans-serif',
          }}>
            <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 8 }}>📧</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', textAlign: 'center', color: '#14121e' }}>
              Введи email клиента
            </h2>
            <p style={{ fontSize: 13, color: '#8a8796', textAlign: 'center', margin: '0 0 20px', lineHeight: 1.5 }}>
              Email привяжется к карточке и будет использован для ссылки активации.
            </p>
            <input
              type="email"
              value={emailDraft}
              onChange={e => setEmailDraft(e.target.value)}
              placeholder="client@example.com"
              autoFocus
              style={{
                width: '100%', padding: '12px 14px', fontSize: 14,
                border: '1px solid rgba(0,0,0,.12)', borderRadius: 10,
                fontFamily: 'inherit', outline: 'none', marginBottom: 12,
                color: '#14121e',
              }}
            />
            {error && (
              <div style={{
                marginBottom: 12, padding: '8px 12px',
                background: 'rgba(220,53,69,.08)', border: '1px solid rgba(220,53,69,.2)',
                borderRadius: 8, fontSize: 12, color: '#dc3545',
              }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={close}
                style={{
                  padding: '10px 16px', fontSize: 13, fontWeight: 500,
                  background: '#F9F8FC', color: '#14121e',
                  border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>Отмена</button>
              <button type="button" onClick={() => generate(emailDraft.trim())}
                disabled={!emailDraft.trim()}
                style={{
                  padding: '10px 20px', fontSize: 13, fontWeight: 600,
                  background: emailDraft.trim() ? '#B15ECC' : '#d2c4dc', color: '#fff',
                  border: 'none', borderRadius: 10,
                  cursor: emailDraft.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                }}>Сохранить и создать ссылку</button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка с готовой ссылкой */}
      {state.kind === 'showing' && (
        <div onClick={(e) => { if (e.target === e.currentTarget) close() }}
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
              Ссылка для активации кабинета
            </h2>
            <p style={{ fontSize: 13, color: '#8a8796', textAlign: 'center', margin: '0 0 20px', lineHeight: 1.5 }}>
              {clientName ? `Для ${clientName}. ` : ''}Срок 30 дней.
            </p>

            <div style={{
              display: 'flex', gap: 6, marginBottom: 12,
              background: '#F9F8FC', border: '1px solid rgba(0,0,0,.08)',
              borderRadius: 10, padding: 6,
            }}>
              <input type="text" value={state.url} readOnly
                onFocus={e => e.currentTarget.select()}
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
              background: state.emailSent ? 'rgba(22,163,97,.08)' : 'rgba(255,193,7,.08)',
              border: `1px solid ${state.emailSent ? 'rgba(22,163,97,.25)' : 'rgba(255,193,7,.3)'}`,
              borderRadius: 8, fontSize: 12, lineHeight: 1.5, marginBottom: 16,
            }}>
              {state.emailSent ? `✓ Email с ссылкой отправлен на ${state.email}` : `⚠ Email не отправлен${state.emailError ? ` (${state.emailError})` : ''} — скопируй ссылку и пошли через TG/WhatsApp`}
            </div>

            {/* Поправить email и переотправить */}
            {!editingEmail ? (
              <button type="button"
                onClick={() => { setEditingEmail(true); setResendDraft(state.email); setError(null) }}
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
              <button type="button" onClick={close}
                style={{
                  padding: '10px 20px', fontSize: 13, fontWeight: 600,
                  background: '#14121e', color: '#fff',
                  border: 'none', borderRadius: 10, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}>Готово</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
