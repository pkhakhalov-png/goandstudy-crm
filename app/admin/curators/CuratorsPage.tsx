'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { prepareCuratorAccess, type AccessResult } from './actions'

interface Props {
  curators: any[]
}

export function CuratorsPage({ curators }: Props) {
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<{ curator: any; result: AccessResult } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const filtered = curators.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
  })

  function handleAccess(curator: any) {
    if (busyId) return
    setBusyId(curator.id)
    startTransition(async () => {
      const result = await prepareCuratorAccess(curator.id)
      setBusyId(null)
      setModal({ curator, result })
    })
  }

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Найти куратора..."
          style={{ padding: '8px 14px', fontSize: 13, border: '1px solid var(--bor2)', borderRadius: 9, background: 'var(--surf)', width: 260, outline: 'none' }}
        />
        <Link href="/admin/curators/new" className="btn-p" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.2">
            <line x1="6" y1="1" x2="6" y2="11" /><line x1="1" y1="6" x2="11" y2="6" />
          </svg>
          Пригласить куратора
        </Link>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--bor2)' }}>
              <th style={{ padding: '12px 16px' }}>Имя</th>
              <th style={{ padding: '12px 12px' }}>Email</th>
              <th style={{ padding: '12px 12px' }}>Специализации</th>
              <th style={{ padding: '12px 12px' }}>Языки</th>
              <th style={{ padding: '12px 12px', textAlign: 'center' }}>Макс</th>
              <th style={{ padding: '12px 12px', textAlign: 'center' }}>Клиентов</th>
              <th style={{ padding: '12px 12px', textAlign: 'center' }}>Статус</th>
              <th style={{ padding: '12px 12px', textAlign: 'right' }}>Доступ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--bor)' }}>
                <td style={{ padding: '14px 16px' }}>
                  <Link href={`/admin/curators/${c.id}`} style={{ fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>
                    {c.name}
                  </Link>
                  {c.telegram_username && (
                    <div style={{ fontSize: 10, color: 'var(--purple)', marginTop: 2 }}>@{c.telegram_username}</div>
                  )}
                </td>
                <td style={{ padding: '14px 12px', color: 'var(--muted)', fontSize: 12 }}>{c.email}</td>
                <td style={{ padding: '14px 12px' }}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(c.specializations || []).map((s: string) => (
                      <span key={s} style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: 'rgba(177,94,204,.1)', color: 'var(--purple)' }}>{s}</span>
                    ))}
                    {(!c.specializations || c.specializations.length === 0) && <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>}
                  </div>
                </td>
                <td style={{ padding: '14px 12px' }}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(c.languages || []).map((l: string) => (
                      <span key={l} style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: 'rgba(0,136,204,.1)', color: '#0088cc' }}>{l}</span>
                    ))}
                    {(!c.languages || c.languages.length === 0) && <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>}
                  </div>
                </td>
                <td style={{ padding: '14px 12px', textAlign: 'center', fontWeight: 600 }}>{c.max_clients ?? 20}</td>
                <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                  <span style={{
                    fontWeight: 700,
                    color: c.activeClients >= (c.max_clients || 20) ? 'var(--red)' : c.activeClients > (c.max_clients || 20) * 0.8 ? 'var(--gold)' : 'var(--green)',
                  }}>{c.activeClients}</span>
                </td>
                <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block', padding: '3px 10px', borderRadius: 8, fontSize: 10, fontWeight: 600,
                    background: c.is_active ? 'rgba(22,163,97,.1)' : 'rgba(220,53,69,.08)',
                    color: c.is_active ? 'var(--green)' : 'var(--red)',
                  }}>
                    {c.is_active ? 'Активен' : 'Неактивен'}
                  </span>
                </td>
                <td style={{ padding: '14px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {c.emailRaw ? (
                    <button
                      type="button"
                      onClick={() => handleAccess(c)}
                      disabled={busyId === c.id}
                      className="btn-s"
                      title={c.user_id ? 'Сбросить пароль и получить новый' : 'Создать invite-ссылку для активации'}
                      style={{ fontSize: 11, padding: '5px 11px', opacity: busyId === c.id ? 0.6 : 1 }}
                    >
                      {busyId === c.id ? '…' : c.user_id ? '🔑 Новый пароль' : '✉ Дать доступ'}
                    </button>
                  ) : (
                    <Link href={`/admin/curators/${c.id}`} style={{ fontSize: 11, color: 'var(--muted)', textDecoration: 'underline' }}>
                      нет email
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>Нет кураторов</div>
        )}
      </div>

      {modal && (
        <AccessModal curator={modal.curator} result={modal.result} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

function AccessModal({ curator, result, onClose }: { curator: any; result: AccessResult; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null)

  function copy(text: string, tag: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(tag)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  let messageForCurator = ''
  if (result.kind === 'invite') {
    messageForCurator = `Привет, ${curator.name}! Тебя пригласили работать куратором в GoAndStudy CRM.\nАктивируй кабинет по ссылке (живёт 30 дней):\n${result.url}`
  } else if (result.kind === 'reset') {
    messageForCurator = `Привет, ${curator.name}! Кабинет куратора готов.\nВход: ${result.loginUrl}\nEmail: ${result.email}\nПароль: ${result.password}`
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surf)', borderRadius: 14, padding: 24,
          maxWidth: 540, width: '100%', boxShadow: '0 24px 60px rgba(0,0,0,.25)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 4 }}>
              Доступ для куратора
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{curator.name}</div>
          </div>
          <button onClick={onClose} className="btn-s" style={{ padding: '5px 11px', fontSize: 12 }}>Закрыть</button>
        </div>

        {result.kind === 'error' && (
          <div style={{ padding: 12, background: 'rgba(255,59,48,.06)', color: '#C92D22', borderRadius: 8, fontSize: 13 }}>
            Ошибка: {result.error}
          </div>
        )}

        {result.kind === 'invite' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <InfoBlock
              label="Тип доступа"
              value="Invite-ссылка — куратор сам задаст пароль"
              accent="#B15ECC"
            />
            <CopyField label="Email" value={result.email} onCopy={() => copy(result.email, 'email')} copied={copied === 'email'} />
            <CopyField label="Ссылка (30 дней)" value={result.url} onCopy={() => copy(result.url, 'link')} copied={copied === 'link'} multiline />
            <EmailStatus sent={result.emailSent} error={result.emailError} />
          </div>
        )}

        {result.kind === 'reset' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <InfoBlock
              label="Тип доступа"
              value="Свежий пароль — кабинет уже создан"
              accent="#16A361"
            />
            <CopyField label="Email" value={result.email} onCopy={() => copy(result.email, 'email')} copied={copied === 'email'} />
            <CopyField label="Пароль" value={result.password} onCopy={() => copy(result.password, 'pw')} copied={copied === 'pw'} mono />
            <CopyField label="Вход" value={result.loginUrl} onCopy={() => copy(result.loginUrl, 'url')} copied={copied === 'url'} />
            <EmailStatus sent={result.emailSent} error={result.emailError} />
          </div>
        )}

        {(result.kind === 'invite' || result.kind === 'reset') && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--bor)' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              Готовое сообщение
            </div>
            <textarea
              readOnly
              value={messageForCurator}
              style={{
                width: '100%', padding: 12, fontSize: 12, fontFamily: 'inherit',
                border: '1px solid var(--bor2)', borderRadius: 8,
                background: '#fafafa', color: 'var(--text)',
                resize: 'vertical', minHeight: 90, outline: 'none',
              }}
            />
            <button
              onClick={() => copy(messageForCurator, 'msg')}
              className="btn-p"
              style={{ marginTop: 8, fontSize: 12, padding: '7px 14px' }}
            >
              {copied === 'msg' ? '✓ Скопировано' : '📋 Скопировать всё для отправки'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoBlock({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8,
      background: `${accent}14`, borderLeft: `3px solid ${accent}`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function CopyField({ label, value, onCopy, copied, mono, multiline }: { label: string; value: string; onCopy: () => void; copied: boolean; mono?: boolean; multiline?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
        <input
          readOnly
          value={value}
          onFocus={e => e.currentTarget.select()}
          style={{
            flex: 1, padding: '8px 10px', fontSize: mono ? 13 : 12,
            fontFamily: mono ? 'ui-monospace, SFMono-Regular, monospace' : 'inherit',
            border: '1px solid var(--bor2)', borderRadius: 8, background: '#fafafa',
            color: 'var(--text)', outline: 'none', minWidth: 0,
            textOverflow: multiline ? 'clip' : 'ellipsis',
          }}
        />
        <button onClick={onCopy} className="btn-s" style={{ fontSize: 11, padding: '6px 12px', whiteSpace: 'nowrap' }}>
          {copied ? '✓' : 'Копировать'}
        </button>
      </div>
    </div>
  )
}

function EmailStatus({ sent, error }: { sent: boolean; error?: string }) {
  if (sent) return (
    <div style={{ fontSize: 12, color: 'var(--green)', padding: '6px 10px', background: 'rgba(22,163,97,.08)', borderRadius: 6 }}>
      ✓ Письмо отправлено через Resend
    </div>
  )
  return (
    <div style={{ fontSize: 12, color: 'var(--muted)', padding: '6px 10px', background: 'rgba(255,193,7,.08)', borderRadius: 6 }}>
      ⚠ Письмо не отправлено{error ? ` — ${error}` : ''}. Скопируй сообщение и отправь руками (WA/TG/email).
    </div>
  )
}
