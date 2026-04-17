'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { logout } from '@/app/login/actions'
import { WelcomeOverlay } from '@/components/WelcomeOverlay'

interface Props {
  userName: string
  userEmail: string
  initials: string
  activePage?: string
}

const accent = 'var(--purple, #B15ECC)'
const accentBg = 'rgba(177,94,204,.07)'
const accentBorder = 'rgba(177,94,204,.2)'
const accentLight = 'rgba(177,94,204,.1)'

const navItems = [
  { key: 'home', href: '/curator', label: 'Главная', icon: 'M3 9.5L8 4l5 5.5V14H3z' },
  { key: 'clients', href: '/curator/clients', label: 'Клиенты', icon: 'M2 3h12v10H2zM5 7h6M5 10h4' },
  { key: 'templates', href: '/curator/templates', label: 'Шаблоны', icon: 'M3 2h10a2 2 0 012 2v8a2 2 0 01-2 2H3a2 2 0 01-2-2V4a2 2 0 012-2zM5 5h6M5 8h4' },
  { key: 'guide', href: '/curator/guide', label: 'Регламент', icon: 'M2 1h8a2 2 0 012 2v10a2 2 0 01-2 2H2V1zM5 5h4M5 8h3M5 11h4' },
  { key: 'resources', href: '/curator/resources', label: 'Ресурсы', icon: 'M8 1v6M4.9 4.9L8 8M1 8h6M15 8h-6M11.1 4.9L8 8M8 15v-6' },
  { key: 'profile', href: '/curator/profile', label: 'Профиль', icon: 'M8 8a3 3 0 100-6 3 3 0 000 6zM3 14c0-2.8 2.2-5 5-5s5 2.2 5 5' },
]

export function CuratorSidebar({ userName, userEmail, initials, activePage = 'home' }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Suspense><WelcomeOverlay /></Suspense>
      <div className={`sidebar-overlay${open ? ' open' : ''}`} onClick={() => setOpen(false)} />

      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="lw" style={{ textAlign: 'center', padding: '20px 16px 14px' }}>
          <img
            src="https://i.ibb.co/7tNx07SW/GAS-logo-01.png"
            alt="Go And Study"
            style={{ height: 48, objectFit: 'contain', display: 'block', margin: '0 auto 6px' }}
          />
          <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.05em' }}>CRM система</div>
        </div>
        <div style={{ margin: '12px 14px 4px', padding: '8px 12px', background: accentLight, border: `1px solid ${accentBorder}`, borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: accent }}>{userName || userEmail}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>Куратор</div>
        </div>
        <nav className="nav">
          <div className="ns">Работа</div>
          {navItems.slice(0, 2).map(item => (
            <Link key={item.key} href={item.href} onClick={() => setOpen(false)}
              className={`ni${activePage === item.key ? ' active' : ''}`}
              style={activePage === item.key ? { borderLeftColor: accent, color: accent, background: accentBg } : undefined}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
                <path d={item.icon} />
              </svg>
              {item.label}
            </Link>
          ))}
          <div className="ns" style={{ marginTop: 12 }}>Инструменты</div>
          {navItems.slice(2, 5).map(item => (
            <Link key={item.key} href={item.href} onClick={() => setOpen(false)}
              className={`ni${activePage === item.key ? ' active' : ''}`}
              style={activePage === item.key ? { borderLeftColor: accent, color: accent, background: accentBg } : undefined}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
                <path d={item.icon} />
              </svg>
              {item.label}
            </Link>
          ))}
          <div className="ns" style={{ marginTop: 12 }}>Профиль</div>
          {navItems.slice(5).map(item => (
            <Link key={item.key} href={item.href} onClick={() => setOpen(false)}
              className={`ni${activePage === item.key ? ' active' : ''}`}
              style={activePage === item.key ? { borderLeftColor: accent, color: accent, background: accentBg } : undefined}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
                <path d={item.icon} />
              </svg>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sf">
          <div className="ur">
            <div className="av" style={{ background: 'linear-gradient(135deg,#B15ECC,#8a3fad)' }}>
              {initials}
            </div>
            <div>
              <div className="un">{userName || userEmail}</div>
              <div className="us">Куратор</div>
            </div>
          </div>
          <form action={logout} style={{ marginTop: 8 }}>
            <button className="btn-s" style={{ width: '100%' }}>Выйти</button>
          </form>
        </div>
      </aside>

      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', top: 12, left: 12, zIndex: 18,
          width: 36, height: 36,
          border: '1px solid var(--bor2)',
          borderRadius: 9, background: 'var(--surf)',
          cursor: 'pointer', display: 'none',
          alignItems: 'center', justifyContent: 'center'
        }}
        className="burger-btn">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
          <line x1="2" y1="4" x2="14" y2="4" />
          <line x1="2" y1="8" x2="14" y2="8" />
          <line x1="2" y1="12" x2="14" y2="12" />
        </svg>
      </button>
    </>
  )
}
