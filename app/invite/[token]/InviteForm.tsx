'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { activateClientAccount } from './actions'

const cardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 18, boxShadow: '0 12px 40px rgba(20,18,30,.08)',
  border: '1px solid rgba(0,0,0,.06)', padding: 40, maxWidth: 440, width: '100%',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: '#8a8796', marginBottom: 6, display: 'block',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', fontSize: 14,
  border: '1px solid rgba(0,0,0,.12)', borderRadius: 10,
  fontFamily: 'inherit', outline: 'none', background: '#fff', color: '#14121e',
}

export function InviteForm({ token, email }: { token: string; email: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Пароль должен быть от 8 символов')
    if (password !== confirm) return setError('Пароли не совпадают')

    setLoading(true)
    const res = await activateClientAccount({ token, password })
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    router.push('/client?onboarding=1')
  }

  return (
    <form onSubmit={submit} style={cardStyle}>
      <div style={{
        fontFamily: 'Oswald, sans-serif', fontSize: 14, fontWeight: 700,
        letterSpacing: '0.16em', textTransform: 'uppercase',
        color: '#B15ECC', marginBottom: 12, textAlign: 'center',
      }}>
        Go &amp; Study
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px', textAlign: 'center', letterSpacing: '-0.01em' }}>
        Активация кабинета
      </h1>
      <p style={{ fontSize: 14, color: '#8a8796', textAlign: 'center', margin: '0 0 28px', lineHeight: 1.5 }}>
        Придумай пароль для входа. Email уже привязан куратором — менять его нельзя.
      </p>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Email</label>
        <input
          type="email"
          value={email}
          readOnly
          style={{ ...inputStyle, background: '#F9F8FC', color: '#8a8796', cursor: 'not-allowed' }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle} htmlFor="pw">Пароль (от 8 символов)</label>
        <input
          id="pw"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          minLength={8}
          required
          autoFocus
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle} htmlFor="pw2">Повтори пароль</label>
        <input
          id="pw2"
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          minLength={8}
          required
          style={inputStyle}
        />
      </div>

      {error && (
        <div style={{
          padding: '10px 12px', background: 'rgba(220,53,69,.08)',
          border: '1px solid rgba(220,53,69,.2)', borderRadius: 8,
          fontSize: 13, color: '#dc3545', marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        style={{
          width: '100%', padding: '14px 20px',
          background: loading ? '#9c4eb3' : '#B15ECC', color: '#fff',
          border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600,
          cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit',
        }}
      >
        {loading ? 'Создаю кабинет…' : 'Войти в кабинет →'}
      </button>
    </form>
  )
}
