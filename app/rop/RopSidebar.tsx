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

const accent = 'var(--gold, #c97d00)'
const accentBg = 'rgba(201,125,0,.07)'
const accentBorder = 'rgba(201,125,0,.2)'
const accentLight = 'rgba(201,125,0,.1)'

const navItems = [
  { key: 'home', href: '/rop', label: 'Главная', icon: 'M3 9.5L8 4l5 5.5V14H3z' },
  { key: 'conversions', href: '/rop/conversions', label: 'Конверсии', icon: 'M2 14L6 6l4 4 4-8' },
  { key: 'response', href: '/rop/response-times', label: 'Время ответа', icon: 'M8 3v5l3 3M8 15a7 7 0 100-14 7 7 0 000 14z' },
  { key: 'pipeline', href: '/rop/pipeline', label: 'Pipeline', icon: 'M2 3h12l-3 5v4l-2 1.5V8L2 3z' },
  { key: 'stuck', href: '/rop/stuck', label: 'Застрявшие', icon: 'M8 1v6M4.9 4.9L8 8M1 8h6' },
  { key: 'analytics', href: '/rop/analytics', label: 'Аналитика', icon: 'M2 14V8l3-4 3 2 3-5 3 4v9' },
  { key: 'tasks', href: '/rop/tasks', label: 'Задачи', icon: 'M4 7l3 3 5-5M3 2h10a2 2 0 012 2v8a2 2 0 01-2 2H3a2 2 0 01-2-2V4a2 2 0 012-2z' },
  { key: 'funnel', href: '/rop/funnel', label: 'Воронка', icon: 'M2 3h12l-3 5v4l-2 1.5V8L2 3z' },
  { key: 'deals', href: '/rop/deals', label: 'Сделки', icon: 'M2 3h12v10H2zM5 7h6M5 10h4' },
  { key: 'settings', href: '/rop/settings', label: 'Настройки', icon: 'M8 10a2 2 0 100-4 2 2 0 000 4zM12.5 8a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z' },
  { key: 'history', href: '/rop/history', label: 'История', icon: 'M8 4v4l2 2M3 8a5 5 0 1010 0A5 5 0 003 8z' },
]

export function RopSidebar({ userName, userEmail, initials, activePage = 'home' }: Props) {
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
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>Руководитель ОП</div>
        </div>
        <nav className="nav">
          <div className="ns">Управление</div>
          {navItems.slice(0, 4).map(item => (
            <Link key={item.key} href={item.href} onClick={() => setOpen(false)}
              className={`ni${activePage === item.key ? ' active' : ''}`}
              style={activePage === item.key ? { borderLeftColor: accent, color: accent, background: accentBg } : undefined}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
                <path d={item.icon} />
              </svg>
              {item.label}
            </Link>
          ))}
          <div className="ns" style={{ marginTop: 12 }}>Контроль</div>
          {navItems.slice(4, 7).map(item => (
            <Link key={item.key} href={item.href} onClick={() => setOpen(false)}
              className={`ni${activePage === item.key ? ' active' : ''}`}
              style={activePage === item.key ? { borderLeftColor: accent, color: accent, background: accentBg } : undefined}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
                <path d={item.icon} />
              </svg>
              {item.label}
            </Link>
          ))}
          <div className="ns" style={{ marginTop: 12 }}>Система</div>
          {navItems.slice(7).map(item => (
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
            <div className="av" style={{ background: 'linear-gradient(135deg,#c97d00,#a06300)' }}>
              {initials}
            </div>
            <div>
              <div className="un">{userName || userEmail}</div>
              <div className="us">РОП</div>
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
          cursor: 'pointer',
          display: 'none',
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
