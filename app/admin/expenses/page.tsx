import { createClient } from '@/lib/supabase/server'
import { logout } from '@/app/login/actions'
import { ExpensesClient } from './ExpensesClient'

export default async function AdminExpensesPage() {
  const supabase = await createClient()
  const [
    { data: rawClients },
    { data: expenses },
    { data: fixedExpenses },
    { data: fixedRecords },
  ] = await Promise.all([
    supabase.from('clients').select('id, name, country, status').order('created_at', { ascending: false }),
    supabase.from('expenses').select('id, client_id, article, who, plan_date, plan_sum, fact_date, fact_sum, is_paid, status, note').order('created_at', { ascending: false }),
    supabase.from('fixed_expenses').select('*').eq('is_active', true).order('created_at', { ascending: true }),
    supabase.from('fixed_expense_records').select('*, fixed_expenses(name, article)').order('month', { ascending: false }),
  ])

  return (
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
  )
}