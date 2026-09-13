import { createClient } from '@/lib/supabase/server'
import { SalesAnalytics } from './SalesAnalytics'

export default async function AdminSalesPage() {
  const supabase = await createClient()
  const [
    { data: salespersons },
    { data: clients },
    { data: payments },
    { data: allBookings },
    { data: salesPlans },
  ] = await Promise.all([
    supabase.from('users').select('id, name, email, is_active').eq('role', 'salesperson').order('name'),
    supabase.from('clients').select('id, name, country, status, salesperson_id, created_at, months'),
    supabase.from('payments_view').select('id, client_id, plan_sum, fact_sum, is_paid, status, plan_date, fact_date'),
    supabase.from('bookings').select('id, salesperson_id, status, booking_date'),
    supabase.from('sales_plans').select('month, salesperson_id, plan_amount'),
  ])

  return (
    <div className="main">
      <div className="topbar">
        <div className="pt">Аналитика продажников</div>
        <span style={{fontSize:12,color:'var(--muted)'}}>{new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}</span>
      </div>
      <SalesAnalytics
        salespersons={salespersons ?? []}
        clients={clients ?? []}
        payments={payments ?? []}
        bookings={allBookings ?? []}
        salesPlans={salesPlans ?? []}
      />
    </div>
  )
}