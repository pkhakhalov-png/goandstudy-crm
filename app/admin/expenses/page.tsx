import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { logout } from '@/app/login/actions'
import { ExpensesClient } from './ExpensesClient'
import { Sidebar } from '../Sidebar'

export default async function AdminExpensesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/sales')

  const { data: rawClients } = await supabase
    .from('clients')
    .select('id, name, country, status')
    .order('created_at', { ascending: false })

  const { data: expenses } = await supabase
    .from('expenses')
    .select('id, client_id, article, who, plan_date, plan_sum, fact_date, fact_sum, is_paid, status, note')
    .order('created_at', { ascending: false })

  const { data: fixedExpenses } = await supabase
    .from('fixed_expenses')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  const { data: fixedRecords } = await supabase
    .from('fixed_expense_records')
    .select('*, fixed_expenses(name, article)')
    .order('month', { ascending: false })

  return (
    <div className="app">
      <Sidebar activePage="expenses" userName={profile?.name || ''} userEmail={user.email || ''} />
      <div className="main">
        <div className="topbar">
          <div className="pt">Расходы</div>
          <div className="tbr">
            <span style={{fontSize:12,color:'var(--muted)'}}>{new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}</span>
            <form action={logout}>
              <button className="btn-s">Выйти</button>
            </form>
          </div>
        </div>
        <ExpensesClient
          clients={rawClients ?? []}
          expenses={expenses ?? []}
          fixedExpenses={fixedExpenses ?? []}
          fixedRecords={fixedRecords ?? []}
        />
      </div>
    </div>
  )
}