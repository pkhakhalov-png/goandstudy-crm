import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SalesSidebar } from '../SalesSidebar'
import { CalendarClient } from '../../admin/calendar/CalendarClient'

export default async function SalesCalendarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin/calendar')
  if (profile?.role === 'rop') redirect('/rop')

  // Только клиенты этого продажника
  const [{ data: rawClients }, { data: allCurators }] = await Promise.all([
    supabase.from('clients').select('id, name, country, status, salesperson_id, curator_id').eq('salesperson_id', user.id),
    supabase.from('curators').select('id, name'),
  ])

  const clientIds = (rawClients ?? []).map(c => c.id)
  const { data: rawPayments } = clientIds.length > 0
    ? await supabase
        .from('payments_view')
        .select('id, client_id, num, plan_date, plan_sum, fact_sum, fact_date, is_paid, status, comment')
        .in('client_id', clientIds)
        .order('plan_date', { ascending: true })
    : { data: [] }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const soonThreshold = new Date(today)
  soonThreshold.setDate(soonThreshold.getDate() + 7)
  const spName = profile?.name || '—'

  const payments = (rawPayments ?? []).map(p => {
    const client = rawClients?.find(c => c.id === p.client_id)

    let status: string = p.status
    if (!p.is_paid) {
      const planDate = new Date(p.plan_date + 'T00:00:00')
      if (planDate < today) status = 'overdue'
      else if (planDate <= soonThreshold) status = 'soon'
      else status = 'pending'
    } else {
      status = 'paid'
    }

    return {
      ...p,
      status,
      client_name: client?.name ?? '—',
      client_country: client?.country ?? '',
      client_status: client?.status ?? 'active',
      salesperson_id: client?.salesperson_id ?? user.id,
      salesperson_name: spName,
      curator_name: allCurators?.find(c => c.id === client?.curator_id)?.name ?? '—',
    }
  })

  const initials = (profile?.name || user.email || 'ПП')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <SalesSidebar
        userName={profile?.name || ''}
        userEmail={user.email || ''}
        initials={initials}
        activePage="calendar"
      />
      <div className="main">
        <div className="topbar">
          <div className="pt">Календарь платежей</div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
        <CalendarClient payments={payments} salespersons={[]} hideSalespersonFilter />
      </div>
    </div>
  )
}
