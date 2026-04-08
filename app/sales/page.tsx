import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { logout } from '@/app/login/actions'
import { SalesPage } from './SalesPage'

export default async function SalesCabinetPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin/clients')

  const { data: rawClients } = await supabase
    .from('clients')
    .select('id, name, phone, email, telegram, country, university, status, months, created_at, salesperson_id, curator_id')
    .eq('salesperson_id', user.id)
    .order('created_at', { ascending: false })

  const { data: payments } = await supabase
    .from('payments_view')
    .select('id, client_id, num, plan_date, plan_sum, fact_sum, fact_date, is_paid, status, comment')

  const { data: allCurators } = await supabase.from('curators').select('id, name')

  const clients = (rawClients ?? []).map(c => ({
    ...c,
    curator: allCurators?.find(cur => cur.id === c.curator_id) ?? null,
    payments: (payments ?? []).filter(p => p.client_id === c.id)
  }))

  const initials = (profile?.name || user.email || 'ПП')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="lw" style={{ textAlign: 'center', padding: '20px 16px 14px' }}>
          <img
            src="https://i.ibb.co/7tNx07SW/GAS-logo-01.png"
            alt="Go And Study"
            style={{ height: 72, objectFit: 'contain', display: 'block', margin: '0 auto 6px' }}
          />
          <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.05em' }}>Кабинет продажника</div>
        </div>
        <div style={{ margin: '12px 14px 4px', padding: '8px 12px', background: 'rgba(22,163,97,.1)', border: '1px solid rgba(22,163,97,.2)', borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>{profile?.name || user.email}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>Продажник</div>
        </div>
        <nav className="nav">
          <div className="ns">Основное</div>
          <Link href="/sales" className="ni active" style={{ borderLeftColor: 'var(--green)', color: 'var(--green)', background: 'rgba(22,163,97,.07)' }}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="2" y="3" width="12" height="10" rx="2"/>
              <line x1="5" y1="7" x2="11" y2="7"/>
              <line x1="5" y1="10" x2="9" y2="10"/>
            </svg>
            Мои клиенты
          </Link>
        </nav>
        <div className="sf">
          <div className="ur">
            <div className="av" style={{ background: 'linear-gradient(135deg,#16a361,#0d7a49)' }}>
              {initials}
            </div>
            <div>
              <div className="un">{profile?.name || user.email}</div>
              <div className="us">Продажник</div>
            </div>
          </div>
          <form action={logout} style={{ marginTop: 8 }}>
            <button className="btn-s" style={{ width: '100%' }}>Выйти</button>
          </form>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="pt">Мои клиенты</div>
          <div className="tbr">
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{clients.length} клиентов</span>
            <Link href="/sales/new" style={{ padding: '9px 18px', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.2">
                <line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/>
              </svg>
              Новый клиент
            </Link>
          </div>
        </div>
        <SalesPage clients={clients} />
      </div>
    </div>
  )
}