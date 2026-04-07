import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { logout } from '@/app/login/actions'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/sales')

  const initials = (profile?.name || user.email || 'АБ')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="lw">
          <div className="lr">
            <div className="li">
              <svg viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="1.8" width="15" height="15">
                <circle cx="7" cy="5" r="3"/><path d="M2 12c0-2.8 2.2-5 5-5s5 2.2 5 5"/>
              </svg>
            </div>
            <div className="lt">Go & Study</div>
          </div>
          <div className="ls">CRM система</div>
        </div>
        <div className="rp">
          <div className="rd"></div>
          <div className="rt2">{profile?.name || user.email}</div>
        </div>
        <nav className="nav">
          <div className="ns">Основное</div>
          <Link href="/admin/clients" className="ni">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="2" y="3" width="12" height="10" rx="2"/><line x1="5" y1="7" x2="11" y2="7"/><line x1="5" y1="10" x2="9" y2="10"/>
            </svg>
            Клиенты
          </Link>
          <Link href="/admin/payments" className="ni">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="1" y="4" width="14" height="9" rx="2"/><line x1="1" y1="8" x2="15" y2="8"/>
            </svg>
            Платежи
          </Link>
          <div className="ns">Система</div>
          <Link href="/admin" className="ni active">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/>
              <rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/>
            </svg>
            Главная
          </Link>
        </nav>
        <div className="sf">
          <div className="ur">
            <div className="av">{initials}</div>
            <div>
              <div className="un">{profile?.name || user.email}</div>
              <div className="us">Администратор</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="pt">Главная</div>
          <div className="tbr">
            <form action={logout}>
              <button className="btn-s">Выйти</button>
            </form>
          </div>
        </div>
        <div className="cnt">
          <p style={{color:'var(--muted)',fontSize:13}}>
            Добро пожаловать в CRM Go & Study. Выберите раздел в меню слева.
          </p>
        </div>
      </div>
    </div>
  )
}