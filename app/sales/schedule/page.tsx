import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SalesSidebar } from '../SalesSidebar'
import { ScheduleClient } from './ScheduleClient'

export default async function SalesSchedulePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin')

  const initials = (profile?.name || user.email || 'ПП')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  const [
    { data: slots },
    { data: bookings },
    { data: allStats },
  ] = await Promise.all([
    supabase.from('schedule_slots').select('day_of_week, start_time').eq('user_id', user.id).eq('is_active', true),
    supabase.from('bookings').select('*').eq('salesperson_id', user.id).gte('booking_date', new Date(new Date().getTime() - 30 * 86400000).toISOString().split('T')[0]).order('booking_date', { ascending: true }),
    supabase.from('bookings').select('id, status, booking_date').eq('salesperson_id', user.id),
  ])

  return (
    <div className="app">
      <SalesSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="schedule" />
      <div className="main">
        <div className="topbar">
          <div className="pt">Расписание</div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Слоты для записи клиентов</span>
        </div>
        <ScheduleClient slots={slots ?? []} bookings={bookings ?? []} allStats={allStats ?? []} />
      </div>
    </div>
  )
}
