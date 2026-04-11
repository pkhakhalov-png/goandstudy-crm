import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '../Sidebar'
import { CalendarClient } from './CalendarClient'

export default async function AdminCalendarPage() {
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
    { data: rawClients },
    { data: allUsers },
    { data: allCurators },
    { data: rawPayments },
    { data: salespersons },
  ] = await Promise.all([
    supabase.from('clients').select('id, name, phone, country, status, salesperson_id, curator_id'),
    supabase.from('users').select('id, name'),
    supabase.from('curators').select('id, name'),
    supabase.from('payments_view').select('id, client_id, num, plan_date, plan_sum, fact_sum, fact_date, is_paid, status, comment').order('plan_date', { ascending: true }),
    supabase.from('users').select('id, name').eq('role', 'salesperson').eq('is_active', true).order('name'),
  ])

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const soonThreshold = new Date(today)
  soonThreshold.setDate(soonThreshold.getDate() + 7)

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
      salesperson_id: client?.salesperson_id ?? null,
      salesperson_name: allUsers?.find(u => u.id === client?.salesperson_id)?.name ?? '—',
      curator_name: allCurators?.find(c => c.id === client?.curator_id)?.name ?? '—',
    }
  })

  return (
    <div className="app">
      <Sidebar activePage="calendar" userName={profile?.name || ''} userEmail={user.email || ''} />
      <div className="main">
        <div className="topbar">
          <div className="pt">Календарь платежей</div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
        <CalendarClient payments={payments} salespersons={salespersons ?? []} />
      </div>
    </div>
  )
}
