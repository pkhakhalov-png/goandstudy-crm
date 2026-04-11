'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { logout } from '@/app/login/actions'
import { WelcomeOverlay } from '@/components/WelcomeOverlay'

interface Props {
  userName: string
  userEmail: string
  initials: string
  activePage?: 'clients' | 'invoices' | 'schedule' | 'funnel'
}

export function SalesSidebar({ userName, userEmail, initials, activePage = 'clients' }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Suspense><WelcomeOverlay /></Suspense>
      {/* Оверлей */}
      <div
        className={`sidebar-overlay${open ? ' open' : ''}`}
        onClick={() => setOpen(false)}
      />

      {/* Сайдбар */}
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="lw" style={{ textAlign: 'center', padding: '20px 16px 14px' }}>
          <img
            src="https://i.ibb.co/7tNx07SW/GAS-logo-01.png"
            alt="Go And Study"
            style={{ height: 48, objectFit: 'contain', display: 'block', margin: '0 auto 6px' }}
          />
          <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.05em' }}>Кабинет продажника</div>
        </div>
        <div style={{ margin: '12px 14px 4px', padding: '8px 12px', background: 'rgba(22,163,97,.1)', border: '1px solid rgba(22,163,97,.2)', borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>{userName || userEmail}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>Продажник</div>
        </div>
        <nav className="nav">
          <div className="ns">Основное</div>
          <Link href="/sales/funnel" onClick={() => setOpen(false)} className={`ni${activePage==='funnel'?' active':''}`}
            style={activePage==='funnel' ? { borderLeftColor: 'var(--green)', color: 'var(--green)', background: 'rgba(22,163,97,.07)' } : undefined}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <path d="M2 3h12l-3 5v4l-2 1.5V8L2 3z"/>
            </svg>
            Воронка
          </Link>
          <Link href="/sales" onClick={() => setOpen(false)} className={`ni${activePage==='clients'?' active':''}`}
            style={activePage==='clients' ? { borderLeftColor: 'var(--green)', color: 'var(--green)', background: 'rgba(22,163,97,.07)' } : undefined}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="2" y="3" width="12" height="10" rx="2"/>
              <line x1="5" y1="7" x2="11" y2="7"/>
              <line x1="5" y1="10" x2="9" y2="10"/>
            </svg>
            Мои клиенты
          </Link>
          <Link href="/sales/invoices" onClick={() => setOpen(false)} className={`ni${activePage==='invoices'?' active':''}`}
            style={activePage==='invoices' ? { borderLeftColor: 'var(--green)', color: 'var(--green)', background: 'rgba(22,163,97,.07)' } : undefined}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="2" y="1" width="12" height="14" rx="2"/>
              <line x1="5" y1="5" x2="11" y2="5"/>
              <line x1="5" y1="8" x2="9" y2="8"/>
              <line x1="5" y1="11" x2="8" y2="11"/>
            </svg>
            Счета
          </Link>
          <Link href="/sales/schedule" onClick={() => setOpen(false)} className={`ni${activePage==='schedule'?' active':''}`}
            style={activePage==='schedule' ? { borderLeftColor: 'var(--green)', color: 'var(--green)', background: 'rgba(22,163,97,.07)' } : undefined}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="2" y="2" width="12" height="12" rx="2"/>
              <line x1="2" y1="6" x2="14" y2="6"/>
              <line x1="5" y1="1" x2="5" y2="4"/>
              <line x1="11" y1="1" x2="11" y2="4"/>
            </svg>
            Расписание
          </Link>
        </nav>
        <div className="sf">
          <div className="ur">
            <div className="av" style={{ background: 'linear-gradient(135deg,#16a361,#0d7a49)' }}>
              {initials}
            </div>
            <div>
              <div className="un">{userName || userEmail}</div>
              <div className="us">Продажник</div>
            </div>
          </div>
          <form action={logout} style={{ marginTop: 8 }}>
            <button className="btn-s" style={{ width: '100%' }}>Выйти</button>
          </form>
        </div>
      </aside>

      {/* Бургер кнопка */}
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', top: 12, left: 12, zIndex: 18,
          width: 36, height: 36,
          border: '1px solid var(--bor2)',
          borderRadius: 9, background: 'var(--surf)',
          cursor: 'pointer',
          display: 'none',
          alignItems: 'center', justifyContent: 'center'
        }}
        className="burger-btn">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
          <line x1="2" y1="4" x2="14" y2="4"/>
          <line x1="2" y1="8" x2="14" y2="8"/>
          <line x1="2" y1="12" x2="14" y2="12"/>
        </svg>
      </button>
    </>
  )
}