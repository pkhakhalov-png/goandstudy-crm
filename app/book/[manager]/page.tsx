import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { BookingClient } from '../BookingClient'
import { mskTodayStr, mskTimeStr, mskAddDays, mskDayOfWeek, timeToMinutes, MIN_GAP_MINUTES } from '@/lib/time'

export const dynamic = 'force-dynamic'

export default async function ManagerBookPage({ params }: { params: Promise<{ manager: string }> }) {
  const { manager } = await params
  const supabase = await createAdminClient()

  // Find the salesperson by ID or by slug (name-based)
  const { data: user } = await supabase
    .from('users')
    .select('id, name')
    .eq('id', manager)
    .eq('role', 'salesperson')
    .eq('is_active', true)
    .maybeSingle()

  if (!user) notFound()

  // Get only THIS salesperson's slots
  const { data: allSlots } = await supabase
    .from('schedule_slots')
    .select('user_id, day_of_week, start_time, end_time')
    .eq('user_id', user.id)
    .eq('is_active', true)

  const todayStr = mskTodayStr()
  const futureStr = mskAddDays(30)

  const { data: existingBookings } = await supabase
    .from('bookings')
    .select('salesperson_id, booking_date, start_time')
    .eq('salesperson_id', user.id)
    .gte('booking_date', todayStr)
    .lte('booking_date', futureStr)
    .neq('status', 'cancelled')

  const availableSlots: { date: string; start_time: string; end_time: string; count: number }[] = []

  for (let d = 0; d < 30; d++) {
    const dateStr = mskAddDays(d)
    const dayOfWeek = mskDayOfWeek(dateStr)

    const daySlots = (allSlots ?? []).filter(s => s.day_of_week === dayOfWeek)

    const userBookedMinutes = (existingBookings ?? [])
      .filter(b => b.booking_date === dateStr)
      .map(b => timeToMinutes(b.start_time))

    daySlots.forEach(s => {
      const time = s.start_time.slice(0, 5)
      const tMin = timeToMinutes(time)
      const conflict = userBookedMinutes.some(b => Math.abs(b - tMin) < MIN_GAP_MINUTES)
      if (!conflict) {
        const [h, m] = time.split(':').map(Number)
        const endTotal = h * 60 + m + 30
        const endTime = `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`
        availableSlots.push({ date: dateStr, start_time: time, end_time: endTime, count: 1 })
      }
    })
  }

  const nowTime = mskTimeStr()
  const filtered = availableSlots.filter(s => {
    if (s.date === todayStr && s.start_time <= nowTime) return false
    return true
  })

  return <BookingClient availableSlots={filtered} managerId={user.id} managerName={user.name} />
}
