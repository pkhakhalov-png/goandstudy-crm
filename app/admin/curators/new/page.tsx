'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createCurator } from '../actions'

const COUNTRIES = ['UK', 'Italy', 'Netherlands', 'Germany', 'Spain', 'France', 'Czech Republic', 'Austria', 'Switzerland', 'USA', 'Canada', 'Australia', 'China', 'Japan', 'South Korea']
const LANGUAGES = ['ru', 'en', 'de', 'it', 'es', 'fr', 'cs', 'zh', 'ja', 'ko']

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', background: '#fff',
  border: '1px solid rgba(0,0,0,.12)', borderRadius: 8,
  fontSize: 13, color: '#14121e', boxSizing: 'border-box',
  fontFamily: 'inherit', outline: 'none',
}
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: '#8a8796', fontWeight: 600,
  display: 'block', marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}
const cardStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid rgba(0,0,0,.07)',
  borderRadius: 14, padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 1px 4px rgba(0,0,0,.07)',
}

function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function NewCuratorPage() {
  const [error, setError] = useState('')
  const [password, setPassword] = useState(generatePassword())
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [selectedLangs, setSelectedLangs] = useState<string[]>(['ru'])
  const [, startTransition] = useTransition()

  function toggleItem(list: string[], item: string, setter: (v: string[]) => void) {
    setter(list.includes(item) ? list.filter(x => x !== item) : [...list, item])
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const form = new FormData(e.currentTarget)
    form.set('specializations', selectedCountries.join(','))
    form.set('languages', selectedLangs.join(','))

    startTransition(async () => {
      const result = await createCurator(form)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '40px 20px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <Link href="/admin/curators" style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18"><path d="M10 13L5 8l5-5" /></svg>
          </Link>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Пригласить куратора</div>
        </div>

        {error && (
          <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(220,53,69,.08)', border: '1px solid rgba(220,53,69,.25)', borderRadius: 10, color: 'var(--red)', fontSize: 13 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={cardStyle}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#14121e', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Данные аккаунта</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>ФИО *</label>
                <input name="name" required placeholder="Анна Иванова" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Email *</label>
                <input name="email" type="email" required placeholder="curator@goandstudy.com" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Временный пароль *</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input name="password" required value={password} onChange={e => setPassword(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                  <button type="button" onClick={() => setPassword(generatePassword())} className="btn-s" style={{ padding: '6px 10px', fontSize: 11, whiteSpace: 'nowrap' }}>Новый</button>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Telegram username</label>
                <input name="telegram_username" placeholder="username" style={inputStyle} />
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#14121e', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Специализации (страны)</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {COUNTRIES.map(c => (
                <button key={c} type="button" onClick={() => toggleItem(selectedCountries, c, setSelectedCountries)}
                  style={{
                    padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: selectedCountries.includes(c) ? '1px solid var(--purple)' : '1px solid var(--bor2)',
                    background: selectedCountries.includes(c) ? 'rgba(177,94,204,.12)' : 'var(--surf)',
                    color: selectedCountries.includes(c) ? 'var(--purple)' : 'var(--muted)',
                  }}>{c}</button>
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#14121e', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Языки</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {LANGUAGES.map(l => (
                <button key={l} type="button" onClick={() => toggleItem(selectedLangs, l, setSelectedLangs)}
                  style={{
                    padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: selectedLangs.includes(l) ? '1px solid #0088cc' : '1px solid var(--bor2)',
                    background: selectedLangs.includes(l) ? 'rgba(0,136,204,.12)' : 'var(--surf)',
                    color: selectedLangs.includes(l) ? '#0088cc' : 'var(--muted)',
                  }}>{l}</button>
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#14121e', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Нагрузка</div>
            <div>
              <label style={labelStyle}>Макс клиентов</label>
              <input name="max_clients" type="number" defaultValue={20} min={1} max={50} style={{ ...inputStyle, width: 100 }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/admin/curators" className="btn-s" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Отмена</Link>
            <button type="submit" className="btn-p">Создать куратора</button>
          </div>
        </form>
      </div>
    </div>
  )
}
