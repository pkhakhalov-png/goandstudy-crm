import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ScheduleClient } from './ScheduleClient'
import { mskAddDays } from '@/lib/time'
import { viewer } from '@/lib/auth/viewer'

export default async function SalesSchedulePage() {
  const supabase = await createClient()
  // Профиль читается общей функцией: оболочка раздела спрашивает то же самое,
  // и без неё это был бы второй одинаковый поход в базу за тот же запрос
  const { user, profile } = await viewer()
  if (!user) redirect('/login')

  if (profile?.role === 'admin') redirect('/admin')
  if (profile?.role === 'rop') redirect('/rop')

  const [
    { data: slots },
    { data: bookings },
    { data: allStats },
  ] = await Promise.all([
    supabase.from('schedule_slots').select('day_of_week, start_time').eq('user_id', user.id).eq('is_active', true),
    supabase.from('bookings').select('*').eq('salesperson_id', user.id).gte('booking_date', mskAddDays(-30)).order('booking_date', { ascending: true }),
    supabase.from('bookings').select('id, status, booking_date').eq('salesperson_id', user.id),
  ])

  return (
    <div className="main">
      <div className="topbar">
        <div className="pt">Расписание</div>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Слоты для записи клиентов</span>
      </div>
      <ScheduleClient slots={slots ?? []} bookings={bookings ?? []} allStats={allStats ?? []} userId={user.id} />
    </div>
  )
}
