'use client'

import { useState, Suspense, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/app/login/actions'
import { WelcomeOverlay } from '@/components/WelcomeOverlay'
import { NavPending } from '@/components/NavPending'

interface Props {
  userName: string
  userEmail: string
}

/**
 * Пункт меню, который становится активным сразу по нажатию.
 *
 * Раньше активный пункт приходил пропсом с сервера: подсветка переезжала только
 * после того, как новая страница отрисовалась, то есть через полсекунды после
 * клика. Теперь текущий адрес берётся на клиенте, а на время перехода пункт
 * подсвечивается как нажатый — ответ на действие человек видит сразу.
 */
function NavLink({ href, exact, children, onNavigate }: {
  href: string
  /** Точное совпадение адреса. Нужно «Главной»: иначе она активна всегда. */
  exact?: boolean
  children: ReactNode
  onNavigate: () => void
}) {
  const pathname = usePathname()
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link href={href} onClick={onNavigate} className={`ni${active ? ' active' : ''}`}>
      {children}
      <NavPending />
    </Link>
  )
}

export function Sidebar({ userName, userEmail }: Props) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  const initials = (userName || userEmail || 'АБ')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <>
      <Suspense><WelcomeOverlay /></Suspense>
      {/* Оверлей */}
      <div className={`sidebar-overlay${open ? ' open' : ''}`} onClick={close} />

      {/* Сайдбар */}
      <aside className={`sidebar${open ? ' open' : ''}`}>
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
          <NavLink href="/admin/funnel" onNavigate={close}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <path d="M2 3h12l-3 5v4l-2 1.5V8L2 3z"/>
            </svg>
            Воронка
          </NavLink>
          <NavLink href="/admin/clients" onNavigate={close}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="2" y="3" width="12" height="10" rx="2"/>
              <line x1="5" y1="7" x2="11" y2="7"/>
              <line x1="5" y1="10" x2="9" y2="10"/>
            </svg>
            Клиенты
          </NavLink>
          <NavLink href="/admin/payments" onNavigate={close}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="1" y="4" width="14" height="9" rx="2"/>
              <line x1="1" y1="8" x2="15" y2="8"/>
            </svg>
            Платежи
          </NavLink>
          <NavLink href="/admin/expenses" onNavigate={close}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <path d="M8 2v12M4 6l4-4 4 4"/>
              <line x1="3" y1="14" x2="13" y2="14"/>
            </svg>
            Расходы
          </NavLink>
          <NavLink href="/admin/invoices" onNavigate={close}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="2" y="1" width="12" height="14" rx="2"/>
              <line x1="5" y1="5" x2="11" y2="5"/>
              <line x1="5" y1="8" x2="9" y2="8"/>
              <line x1="5" y1="11" x2="8" y2="11"/>
            </svg>
            Счета
          </NavLink>
          <NavLink href="/admin/calendar" onNavigate={close}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="2" y="2" width="12" height="12" rx="2"/>
              <line x1="2" y1="6" x2="14" y2="6"/>
              <line x1="5" y1="1" x2="5" y2="4"/>
              <line x1="11" y1="1" x2="11" y2="4"/>
            </svg>
            Календарь
          </NavLink>
          <div className="ns">Аналитика</div>
          <NavLink href="/admin/analytics" onNavigate={close}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="2" y="8" width="3" height="6"/><rect x="6.5" y="4" width="3" height="10"/><rect x="11" y="10" width="3" height="4"/>
            </svg>
            Аналитика
          </NavLink>
          <NavLink href="/admin/seo" onNavigate={close}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <circle cx="7" cy="7" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/>
            </svg>
            SEO
          </NavLink>
          <NavLink href="/admin/sales" onNavigate={close}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <polyline points="2,13 5,8 8,10 11,4 14,6"/>
              <line x1="2" y1="14" x2="14" y2="14"/>
            </svg>
            Продажники
          </NavLink>
          <NavLink href="/admin/curators" onNavigate={close}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
            </svg>
            Кураторы
          </NavLink>
          <div className="ns">Система</div>
          <NavLink href="/admin" exact onNavigate={close}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="1" y="1" width="6" height="6" rx="1.5"/>
              <rect x="9" y="1" width="6" height="6" rx="1.5"/>
              <rect x="1" y="9" width="6" height="6" rx="1.5"/>
              <rect x="9" y="9" width="6" height="6" rx="1.5"/>
            </svg>
            Главная
          </NavLink>
          <NavLink href="/admin/settings" onNavigate={close}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <circle cx="8" cy="8" r="3"/>
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M3.05 12.95l1.42-1.42M11.53 4.47l1.42-1.42"/>
            </svg>
            Настройки
          </NavLink>
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
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', top: 12, left: 12, zIndex: 18,
          width: 36, height: 36, border: '1px solid var(--bor2)',
          borderRadius: 9, background: 'var(--surf)', cursor: 'pointer',
          alignItems: 'center', justifyContent: 'center'
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
