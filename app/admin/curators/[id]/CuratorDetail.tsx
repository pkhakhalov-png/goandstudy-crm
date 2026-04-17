'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { updateCurator } from '../actions'

interface Props {
  curator: any
  clients: any[]
}

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
  background: 'var(--surf)', border: '1px solid var(--bor2)',
  borderRadius: 14, padding: '16px 20px', marginBottom: 16,
}
const sectionTitle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12,
}

export function CuratorDetail({ curator, clients }: Props) {
  const [name, setName] = useState(curator.name || '')
  const [tg, setTg] = useState(curator.telegram_username || '')
  const [maxClients, setMaxClients] = useState(String(curator.max_clients ?? 20))
  const [isActive, setIsActive] = useState(curator.is_active)
  const [specs, setSpecs] = useState<string[]>(curator.specializations || [])
  const [langs, setLangs] = useState<string[]>(curator.languages || [])
  const [message, setMessage] = useState('')
  const [, startTransition] = useTransition()

  function toggleItem(list: string[], item: string, setter: (v: string[]) => void) {
    setter(list.includes(item) ? list.filter(x => x !== item) : [...list, item])
  }

  function handleSave() {
    const form = new FormData()
    form.set('name', name)
    form.set('telegram_username', tg)
    form.set('max_clients', maxClients)
    form.set('is_active', String(isActive))
    form.set('specializations', specs.join(','))
    form.set('languages', langs.join(','))

    startTransition(async () => {
      const res = await updateCurator(curator.id, form)
      if (res?.error) setMessage(`Ошибка: ${res.error}`)
      else setMessage('Сохранено')
      setTimeout(() => setMessage(''), 3000)
    })
  }

  const activeClients = clients.filter(c => c.status === 'active')

  return (
    <>
      <Link href="/admin/curators" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14"><path d="M10 13L5 8l5-5" /></svg>
        Все кураторы
      </Link>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left — edit form */}
        <div>
          <div style={cardStyle}>
            <div style={sectionTitle}>Профиль</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>ФИО</label>
                <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <div style={{ fontSize: 13, color: 'var(--muted)', padding: '9px 0' }}>{curator.email}</div>
              </div>
              <div>
                <label style={labelStyle}>Telegram</label>
                <input value={tg} onChange={e => setTg(e.target.value)} placeholder="username" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Макс клиентов</label>
                <input type="number" value={maxClients} onChange={e => setMaxClients(e.target.value)} min={1} max={50} style={{ ...inputStyle, width: 100 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Активен</label>
                <button type="button" onClick={() => setIsActive(!isActive)}
                  style={{
                    width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                    background: isActive ? 'var(--green)' : 'var(--bor2)',
                    position: 'relative', transition: 'background .2s',
                  }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 3,
                    left: isActive ? 21 : 3, transition: 'left .2s',
                  }} />
                </button>
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={sectionTitle}>Специализации</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {COUNTRIES.map(c => (
                <button key={c} type="button" onClick={() => toggleItem(specs, c, setSpecs)}
                  style={{
                    padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    border: specs.includes(c) ? '1px solid var(--purple)' : '1px solid var(--bor2)',
                    background: specs.includes(c) ? 'rgba(177,94,204,.12)' : 'transparent',
                    color: specs.includes(c) ? 'var(--purple)' : 'var(--muted)',
                  }}>{c}</button>
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={sectionTitle}>Языки</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {LANGUAGES.map(l => (
                <button key={l} type="button" onClick={() => toggleItem(langs, l, setLangs)}
                  style={{
                    padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    border: langs.includes(l) ? '1px solid #0088cc' : '1px solid var(--bor2)',
                    background: langs.includes(l) ? 'rgba(0,136,204,.12)' : 'transparent',
                    color: langs.includes(l) ? '#0088cc' : 'var(--muted)',
                  }}>{l}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={handleSave} className="btn-p">Сохранить</button>
            {message && <span style={{ fontSize: 12, color: message.startsWith('Ошибка') ? 'var(--red)' : 'var(--green)' }}>{message}</span>}
          </div>
        </div>

        {/* Right — clients list */}
        <div>
          <div style={cardStyle}>
            <div style={sectionTitle}>Клиенты ({activeClients.length} активных / {clients.length} всего)</div>
            {clients.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)', fontSize: 13 }}>Нет привязанных клиентов</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {clients.map(c => (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    borderRadius: 10, border: '1px solid var(--bor)',
                    background: c.status === 'completed' ? 'rgba(22,163,97,.04)' : 'transparent',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                      {c.country && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{c.country}</div>}
                    </div>
                    {c.current_stage_code && (
                      <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: 'rgba(177,94,204,.1)', color: 'var(--purple)' }}>
                        {c.current_stage_code}
                      </span>
                    )}
                    <span style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                      background: c.status === 'active' ? 'rgba(22,163,97,.1)' : 'rgba(142,142,147,.1)',
                      color: c.status === 'active' ? 'var(--green)' : 'var(--muted)',
                    }}>
                      {c.status === 'active' ? 'Активен' : 'Завершён'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={cardStyle}>
            <div style={sectionTitle}>Информация</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              <div>Создан: {new Date(curator.created_at).toLocaleDateString('ru-RU')}</div>
              {curator.user_id && <div>User ID: {curator.user_id.slice(0, 8)}...</div>}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
