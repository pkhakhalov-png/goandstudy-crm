import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '../Sidebar'
import { SalesAnalytics } from './SalesAnalytics'

export default async function AdminSalesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/sales')

  const { data: salespersons } = await supabase
    .from('users')
    .select('id, name, email, is_active')
    .eq('role', 'salesperson')
    .order('name')

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, country, status, salesperson_id, created_at, months')

  const { data: payments } = await supabase
    .from('payments_view')
    .select('id, client_id, plan_sum, fact_sum, is_paid, status, plan_date, fact_date')

  return (
    <div className="app">
      <Sidebar activePage="sales" userName={profile?.name || ''} userEmail={user.email || ''} />
      <div className="main">
        <div className="topbar">
          <div className="pt">Аналитика продажников</div>
        </div>
        <SalesAnalytics
          salespersons={salespersons ?? []}
          clients={clients ?? []}
          payments={payments ?? []}
        />
      </div>
    </div>
  )
}