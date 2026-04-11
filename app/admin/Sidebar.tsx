'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { logout } from '@/app/login/actions'
import { WelcomeOverlay } from '@/components/WelcomeOverlay'

interface Props {
  activePage: 'clients' | 'payments' | 'expenses' | 'invoices' | 'calendar' | 'funnel' | 'home' | 'sales' | 'settings'
  userName: string
  userEmail: string
}

export function Sidebar({ activePage, userName, userEmail }: Props) {
  const [open, setOpen] = useState(false)

  const initials = (userName || userEmail || 'АБ')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <>
      <Suspense><WelcomeOverlay /></Suspense>
      {/* Оверлей */}
      <div className={`sidebar-overlay${open?' open':''}`} onClick={()=>setOpen(false)}/>

      {/* Сайдбар */}
      <aside className={`sidebar${open?' open':''}`}>
        <div className="lw" style={{ textAlign: 'center', padding: '20px 16px 14px' }}>
          <img
            src="https://i.ibb.co/7tNx07SW/GAS-logo-01.png"
            alt="Go And Study"
            style={{ height: 48, objectFit: 'contain', display: 'block', margin: '0 auto 6px' }}
          />
          <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.05em' }}>CRM система</div>
        </div>
        <div className="rp">
          <div className="rd"></div>
          <div className="rt2">{userName || userEmail}</div>
        </div>
        <nav className="nav">
          <div className="ns">Основное</div>
          <Link href="/admin/funnel" onClick={()=>setOpen(false)} className={`ni${activePage==='funnel'?' active':''}`}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <path d="M2 3h12l-3 5v4l-2 1.5V8L2 3z"/>
            </svg>
            Воронка
          </Link>
          <Link href="/admin/clients" onClick={()=>setOpen(false)} className={`ni${activePage==='clients'?' active':''}`}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="2" y="3" width="12" height="10" rx="2"/>
              <line x1="5" y1="7" x2="11" y2="7"/>
              <line x1="5" y1="10" x2="9" y2="10"/>
            </svg>
            Клиенты
          </Link>
          <Link href="/admin/payments" onClick={()=>setOpen(false)} className={`ni${activePage==='payments'?' active':''}`}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="1" y="4" width="14" height="9" rx="2"/>
              <line x1="1" y1="8" x2="15" y2="8"/>
            </svg>
            Платежи
          </Link>
          <Link href="/admin/expenses" onClick={()=>setOpen(false)} className={`ni${activePage==='expenses'?' active':''}`}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <path d="M8 2v12M4 6l4-4 4 4"/>
              <line x1="3" y1="14" x2="13" y2="14"/>
            </svg>
            Расходы
          </Link>
          <Link href="/admin/invoices" onClick={()=>setOpen(false)} className={`ni${activePage==='invoices'?' active':''}`}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="2" y="1" width="12" height="14" rx="2"/>
              <line x1="5" y1="5" x2="11" y2="5"/>
              <line x1="5" y1="8" x2="9" y2="8"/>
              <line x1="5" y1="11" x2="8" y2="11"/>
            </svg>
            Счета
          </Link>
          <Link href="/admin/calendar" onClick={()=>setOpen(false)} className={`ni${activePage==='calendar'?' active':''}`}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="2" y="2" width="12" height="12" rx="2"/>
              <line x1="2" y1="6" x2="14" y2="6"/>
              <line x1="5" y1="1" x2="5" y2="4"/>
              <line x1="11" y1="1" x2="11" y2="4"/>
            </svg>
            Календарь
          </Link>
          <div className="ns">Аналитика</div>
          <Link href="/admin/sales" onClick={()=>setOpen(false)} className={`ni${activePage==='sales'?' active':''}`}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <polyline points="2,13 5,8 8,10 11,4 14,6"/>
              <line x1="2" y1="14" x2="14" y2="14"/>
            </svg>
            Продажники
          </Link>
          <div className="ns">Система</div>
          <Link href="/admin" onClick={()=>setOpen(false)} className={`ni${activePage==='home'?' active':''}`}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="1" y="1" width="6" height="6" rx="1.5"/>
              <rect x="9" y="1" width="6" height="6" rx="1.5"/>
              <rect x="1" y="9" width="6" height="6" rx="1.5"/>
              <rect x="9" y="9" width="6" height="6" rx="1.5"/>
            </svg>
            Главная
          </Link>
          <Link href="/admin/settings" onClick={()=>setOpen(false)} className={`ni${activePage==='settings'?' active':''}`}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <circle cx="8" cy="8" r="3"/>
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M3.05 12.95l1.42-1.42M11.53 4.47l1.42-1.42"/>
            </svg>
            Настройки
          </Link>
        </nav>
        <div className="sf">
          <div className="ur">
            <div className="av">{initials}</div>
            <div>
              <div className="un">{userName || userEmail}</div>
              <div className="us">Администратор</div>
            </div>
          </div>
          <form action={logout} style={{ marginTop: 8 }}>
            <button className="btn-s" style={{ width: '100%' }}>Выйти</button>
          </form>
        </div>
      </aside>

      {/* Бургер в топбаре — рендерится через портал-like подход */}
      <style>{`
        .burger-btn-portal {
          display: none;
        }
        @media (max-width: 768px) {
          .burger-btn-portal {
            display: flex;
          }
        }
      `}</style>
      <button
        className="burger-btn-portal"
        onClick={()=>setOpen(true)}
        style={{
          position:'fixed',top:12,left:12,zIndex:18,
          width:36,height:36,border:'1px solid var(--bor2)',
          borderRadius:9,background:'var(--surf)',cursor:'pointer',
          alignItems:'center',justifyContent:'center'
        }}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
          <line x1="2" y1="4" x2="14" y2="4"/>
          <line x1="2" y1="8" x2="14" y2="8"/>
          <line x1="2" y1="12" x2="14" y2="12"/>
        </svg>
      </button>
    </>
  )
}