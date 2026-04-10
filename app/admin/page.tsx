import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { Dashboard } from './Dashboard'

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

  const [
    { data: clients },
    { data: payments },
    { data: expenses },
    { data: salespersons },
    { data: fixedExpenses },
  ] = await Promise.all([
    supabase.from('clients').select('id, name, country, status, salesperson_id, created_at'),
    supabase.from('payments_view').select('id, client_id, plan_sum, fact_sum, is_paid, status, plan_date, fact_date'),
    supabase.from('expenses').select('id, client_id, plan_sum, fact_sum, is_paid, article, who, plan_date, fact_date'),
    supabase.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
    supabase.from('fixed_expenses').select('id, name, amount, period, article, is_active').eq('is_active', true),
  ])

  return (
    <div className="app">
      <Sidebar activePage="home" userName={profile?.name || ''} userEmail={user.email || ''} />
      <div className="main">
        <div className="topbar">
          <div className="pt">Главная</div>
          <span style={{fontSize:12,color:'var(--muted)'}}>{new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}</span>
        </div>
        <Dashboard
          clients={clients ?? []}
          payments={payments ?? []}
          expenses={expenses ?? []}
          salespersons={salespersons ?? []}
          fixedExpenses={fixedExpenses ?? []}
        />
      </div>
    </div>
  )
}