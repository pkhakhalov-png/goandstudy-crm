'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Props {
  curators: any[]
}

export function CuratorsPage({ curators }: Props) {
  const [search, setSearch] = useState('')

  const filtered = curators.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
  })

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
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--bor)', cursor: 'pointer' }}>
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
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>Нет кураторов</div>
        )}
      </div>
    </div>
  )
}
