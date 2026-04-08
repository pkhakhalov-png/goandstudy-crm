import Link from 'next/link'
import { logout } from '@/app/login/actions'

interface Props {
  activePage: 'clients' | 'payments' | 'expenses' | 'home' | 'sales' | 'settings'
  userName: string
  userEmail: string
}

export function Sidebar({ activePage, userName, userEmail }: Props) {
  const initials = (userName || userEmail || 'АБ')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <aside className="sidebar">
      <div className="lw">
        <div className="lr">
          <img
            src="https://i.ibb.co/7tNx07SW/GAS-logo-01.png"
            alt="Go And Study"
            style={{ height: 32, objectFit: 'contain' }}
          />
        </div>
        <div className="ls" style={{ paddingLeft: 0, marginTop: 4 }}>CRM система</div>
      </div>
      <div className="rp">
        <div className="rd"></div>
        <div className="rt2">{userName || userEmail}</div>
      </div>
      <nav className="nav">
        <div className="ns">Основное</div>
        <Link href="/admin/clients" className={`ni${activePage==='clients'?' active':''}`}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
            <rect x="2" y="3" width="12" height="10" rx="2"/>
            <line x1="5" y1="7" x2="11" y2="7"/>
            <line x1="5" y1="10" x2="9" y2="10"/>
          </svg>
          Клиенты
        </Link>
        <Link href="/admin/payments" className={`ni${activePage==='payments'?' active':''}`}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
            <rect x="1" y="4" width="14" height="9" rx="2"/>
            <line x1="1" y1="8" x2="15" y2="8"/>
          </svg>
          Платежи
        </Link>
        <Link href="/admin/expenses" className={`ni${activePage==='expenses'?' active':''}`}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
            <path d="M8 2v12M4 6l4-4 4 4"/>
            <line x1="3" y1="14" x2="13" y2="14"/>
          </svg>
          Расходы
        </Link>
        <div className="ns">Аналитика</div>
        <Link href="/admin/sales" className={`ni${activePage==='sales'?' active':''}`}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
            <polyline points="2,13 5,8 8,10 11,4 14,6"/>
            <line x1="2" y1="14" x2="14" y2="14"/>
          </svg>
          Продажники
        </Link>
        <div className="ns">Система</div>
        <Link href="/admin" className={`ni${activePage==='home'?' active':''}`}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
            <rect x="1" y="1" width="6" height="6" rx="1.5"/>
            <rect x="9" y="1" width="6" height="6" rx="1.5"/>
            <rect x="1" y="9" width="6" height="6" rx="1.5"/>
            <rect x="9" y="9" width="6" height="6" rx="1.5"/>
          </svg>
          Главная
        </Link>
        <Link href="/admin/settings" className={`ni${activePage==='settings'?' active':''}`}>
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
  )
}