import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
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

  // Получаем только своих клиентов
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

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="lw">
          <div className="lr">
            <div className="li" style={{background:'var(--green)'}}>
              <svg viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="1.8" width="15" height="15">
                <circle cx="7" cy="5" r="3"/><path d="M2 12c0-2.8 2.2-5 5-5s5 2.2 5 5"/>
              </svg>
            </div>
            <div className="lt">Go & Study</div>
          </div>
          <div className="ls">Кабинет продажника</div>
        </div>
        <div style={{margin:'12px 14px 4px',padding:'8px 12px',background:'rgba(22,163,97,.1)',border:'1px solid rgba(22,163,97,.2)',borderRadius:10}}>
          <div style={{fontSize:12,fontWeight:700,color:'var(--green)'}}>{profile?.name || user.email}</div>
          <div style={{fontSize:10,color:'var(--muted)',marginTop:1}}>Продажник</div>
        </div>
        <nav className="nav">
          <div className="ns">Основное</div>
          <div className="ni active" style={{borderLeftColor:'var(--green)',color:'var(--green)',background:'rgba(22,163,97,.07)'}}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
              <rect x="2" y="3" width="12" height="10" rx="2"/>
              <line x1="5" y1="7" x2="11" y2="7"/>
              <line x1="5" y1="10" x2="9" y2="10"/>
            </svg>
            Мои клиенты
          </div>
        </nav>
        <div className="sf">
          <div className="ur">
            <div className="av" style={{background:'linear-gradient(135deg,#16a361,#0d7a49)'}}>
              {(profile?.name || user.email || 'ПП').split(' ').map((w:string)=>w[0]).join('').toUpperCase().slice(0,2)}
            </div>
            <div>
              <div className="un">{profile?.name || user.email}</div>
              <div className="us">Продажник</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="pt">Мои клиенты</div>
          <div className="tbr">
            <span style={{fontSize:12,color:'var(--muted)'}}>{clients.length} клиентов</span>
            <form action={logout}>
              <button className="btn-s">Выйти</button>
            </form>
          </div>
        </div>

        <SalesPage clients={clients} />
      </div>
    </div>
  )
}