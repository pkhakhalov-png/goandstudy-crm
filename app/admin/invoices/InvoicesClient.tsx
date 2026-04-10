'use client'

import { useState } from 'react'
import { createInvoice, refreshInvoiceStatus } from './actions'

interface Props {
  invoices: any[]
  clients: { id: number; name: string }[]
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  NEW: { label: 'Новый', cls: 'pw' },
  FORM_SHOWED: { label: 'Форма открыта', cls: 'pw' },
  AUTHORIZING: { label: 'Авторизация', cls: 'ps' },
  AUTHORIZED: { label: 'Авторизован', cls: 'ps' },
  CONFIRMING: { label: 'Подтверждение', cls: 'ps' },
  CONFIRMED: { label: 'Оплачен', cls: 'pa' },
  REVERSED: { label: 'Возврат', cls: 'po' },
  REFUNDED: { label: 'Возвращён', cls: 'po' },
  PARTIAL_REFUNDED: { label: 'Частичный возврат', cls: 'po' },
  REJECTED: { label: 'Отклонён', cls: 'po' },
  DEADLINE_EXPIRED: { label: 'Истёк срок', cls: 'po' },
  CANCELED: { label: 'Отменён', cls: 'po' },
}

export function InvoicesClient({ invoices, clients }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ paymentUrl?: string; sbpPayload?: string } | null>(null)
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)
    const fd = new FormData(e.currentTarget)
    const res = await createInvoice(fd)
    setLoading(false)
    if (res.error) {
      setError(res.error)
    } else {
      setResult({ paymentUrl: res.paymentUrl ?? undefined, sbpPayload: res.sbpPayload ?? undefined })
    }
  }

  async function handleRefresh(id: string) {
    setRefreshing(prev => new Set(prev).add(id))
    await refreshInvoiceStatus(id)
    setRefreshing(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  function copyLink(url: string, id: string) {
    navigator.clipboard.writeText(url)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const totalAll = invoices.reduce((s, i) => s + Number(i.amount), 0)
  const totalPaid = invoices.filter(i => i.status === 'CONFIRMED').reduce((s, i) => s + Number(i.amount), 0)
  const totalPending = invoices.filter(i => !['CONFIRMED', 'REJECTED', 'CANCELED', 'DEADLINE_EXPIRED', 'REVERSED', 'REFUNDED'].includes(i.status)).reduce((s, i) => s + Number(i.amount), 0)

  return (
    <>
      <div className="kw">
        <div className="kg k4">
          <div className="kc">
            <div className="kl">Всего счетов</div>
            <div className="kv" style={{ fontSize: 17 }}>{invoices.length}</div>
          </div>
          <div className="kc">
            <div className="kl">На сумму</div>
            <div className="kv" style={{ fontSize: 17 }}>{totalAll.toLocaleString('ru')} ₽</div>
          </div>
          <div className="kc">
            <div className="kl">Оплачено</div>
            <div className="kv g" style={{ fontSize: 17 }}>{totalPaid.toLocaleString('ru')} ₽</div>
          </div>
          <div className="kc">
            <div className="kl">Ожидает оплаты</div>
            <div className="kv o" style={{ fontSize: 17 }}>{totalPending.toLocaleString('ru')} ₽</div>
          </div>
        </div>
      </div>

      <div className="cnt">
        <div className="ctrl">
          <div className="sl">{invoices.length} счетов</div>
          <button className="btn-p" onClick={() => { setShowForm(!showForm); setResult(null); setError('') }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.2">
              <line x1="6" y1="1" x2="6" y2="11" /><line x1="1" y1="6" x2="11" y2="6" />
            </svg>
            Выставить счёт
          </button>
        </div>

        {showForm && (
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bor)', borderRadius: 16, padding: 24, marginBottom: 16, boxShadow: 'var(--sh)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--text)' }}>Новый счёт СБП</div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Сумма (₽) *</div>
                  <input name="amount" type="number" min="1" step="0.01" required placeholder="10000"
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--bor2)', borderRadius: 9, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)' }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Назначение платежа *</div>
                  <input name="description" required placeholder="Оплата обучения..."
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--bor2)', borderRadius: 9, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)' }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Email для чека *</div>
                  <input name="email" type="email" required placeholder="client@email.com"
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--bor2)', borderRadius: 9, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--bg)' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Клиент (для статистики)</div>
                  <select name="client_id" className="si" style={{ width: '100%', padding: '9px 12px' }}>
                    <option value="">— не выбран —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <button type="submit" disabled={loading} className="btn-p" style={{ opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Создаю...' : 'Создать ссылку СБП'}
                </button>
              </div>
            </form>

            {error && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(220,53,69,.07)', border: '1px solid rgba(220,53,69,.2)', borderRadius: 8, fontSize: 12, color: 'var(--red)', fontWeight: 500 }}>
                {error}
              </div>
            )}

            {result && (
              <div style={{ marginTop: 12, padding: '14px 18px', background: 'rgba(52,199,89,.06)', border: '1px solid rgba(52,199,89,.2)', borderRadius: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>Счёт создан!</div>
                {result.paymentUrl && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Ссылка на оплату:</span>
                    <code style={{ fontSize: 11, background: 'var(--bg)', padding: '4px 8px', borderRadius: 6, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {result.paymentUrl}
                    </code>
                    <button type="button" onClick={() => copyLink(result.paymentUrl!, 'new')} className="btn-s" style={{ padding: '5px 10px', fontSize: 11 }}>
                      {copied === 'new' ? 'Скопировано!' : 'Копировать'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Клиент</th>
                <th>Назначение</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>Ссылка</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>Счетов пока нет</td></tr>
              )}
              {invoices.map(inv => {
                const st = STATUS_MAP[inv.status] || { label: inv.status, cls: 'pw' }
                const isRefreshing = refreshing.has(inv.id)
                return (
                  <tr key={inv.id}>
                    <td style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {new Date(inv.created_at).toLocaleDateString('ru-RU')}<br />
                      <span style={{ fontSize: 10 }}>{new Date(inv.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    <td>
                      <span className="cn">{inv.clients?.name ?? inv.clients?.[0]?.name ?? '—'}</span>
                      {(inv.users?.name ?? inv.users?.[0]?.name) && <div className="cs">{inv.users?.name ?? inv.users?.[0]?.name}</div>}
                    </td>
                    <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inv.description}
                    </td>
                    <td><span className="num">{Number(inv.amount).toLocaleString('ru')} ₽</span></td>
                    <td><span className={`pill ${st.cls}`}><span className="dot"></span>{st.label}</span></td>
                    <td>
                      {inv.payment_url ? (
                        <button type="button" onClick={() => copyLink(inv.payment_url!, inv.id)} className="btn-s" style={{ padding: '4px 10px', fontSize: 10 }}>
                          {copied === inv.id ? 'Скопировано!' : 'Копировать'}
                        </button>
                      ) : '—'}
                    </td>
                    <td>
                      {!['CONFIRMED', 'REJECTED', 'CANCELED', 'REVERSED', 'REFUNDED'].includes(inv.status) && (
                        <button type="button" onClick={() => handleRefresh(inv.id)} disabled={isRefreshing}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, opacity: isRefreshing ? 0.4 : 0.6 }}
                          title="Обновить статус">
                          <svg viewBox="0 0 16 16" fill="none" stroke="var(--purple)" strokeWidth="1.8" width="14" height="14"
                            style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }}>
                            <path d="M14 8A6 6 0 1 1 8 2" /><polyline points="14,2 14,8 8,8" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
