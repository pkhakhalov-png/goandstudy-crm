'use client'

import { useState } from 'react'
import { login } from './actions'

export default function LoginPage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const formData = new FormData(e.currentTarget)
    const result = await login(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      padding: '20px',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Лого */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="https://i.ibb.co/7tNx07SW/GAS-logo-01.png"
            alt="Go And Study"
            style={{ height: 56, objectFit: 'contain', marginBottom: 16 }}
          />
          <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>CRM система</div>
        </div>

        {/* Карточка */}
        <div style={{
          background: '#fff',
          border: '1px solid var(--bor)',
          borderRadius: 16,
          padding: '32px 28px',
          boxShadow: '0 4px 24px rgba(0,0,0,.07)',
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Добро пожаловать
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>
            Войдите в свой аккаунт
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Email
              </label>
              <input
                name="email"
                type="email"
                required
                placeholder="your@email.com"
                style={{
                  width: '100%', padding: '10px 14px',
                  background: 'var(--bg)', border: '1px solid var(--bor2)',
                  borderRadius: 9, fontSize: 13, color: 'var(--text)',
                  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color .15s',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--purple)'}
                onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,.12)'}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Пароль
              </label>
              <input
                name="password"
                type="password"
                required
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '10px 14px',
                  background: 'var(--bg)', border: '1px solid var(--bor2)',
                  borderRadius: 9, fontSize: 13, color: 'var(--text)',
                  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color .15s',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--purple)'}
                onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,.12)'}
              />
            </div>

            {error && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(220,53,69,.07)', border: '1px solid rgba(220,53,69,.2)', borderRadius: 8, fontSize: 12, color: 'var(--red)', fontWeight: 500 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '11px',
                background: loading ? 'rgba(177,94,204,.5)' : 'var(--purple)',
                color: '#fff', border: 'none', borderRadius: 9,
                fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', transition: 'opacity .15s',
              }}
            >
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'var(--muted)' }}>
          Go And Study © {new Date().getFullYear()}
        </div>
      </div>
    </div>
  )
}