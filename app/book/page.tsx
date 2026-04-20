import { createAdminClient } from '@/lib/supabase/server'
import { BookingClient } from './BookingClient'

export const dynamic = 'force-dynamic'

export default async function BookPage() {
  const supabase = await createAdminClient()

  // Get all active salesperson slots
  const { data: allSlots } = await supabase
    .from('schedule_slots')
    .select('user_id, day_of_week, start_time, end_time')
    .eq('is_active', true)

  // Get existing bookings for the next 30 days
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const futureDate = new Date(today)
  futureDate.setDate(futureDate.getDate() + 30)
  const futureStr = futureDate.toISOString().split('T')[0]

  const { data: existingBookings } = await supabase
    .from('bookings')
    .select('salesperson_id, booking_date, start_time')
    .gte('booking_date', todayStr)
    .lte('booking_date', futureStr)
    .neq('status', 'cancelled')

  // Get active salespersons
  const { data: activeSalespersons } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'salesperson')
    .eq('is_active', true)

  const activeIds = new Set(activeSalespersons?.map(u => u.id) ?? [])

  // Build available slots for each date in the next 30 days
  const availableSlots: { date: string; start_time: string; end_time: string; count: number }[] = []

  for (let d = 0; d < 30; d++) {
    const date = new Date(today)
    date.setDate(today.getDate() + d)
    const dateStr = date.toISOString().split('T')[0]
    const dayOfWeek = (date.getDay() + 6) % 7 // Mon=0

    // Find all slots for this day of week from active salespersons
    const daySlots = (allSlots ?? []).filter(
      s => s.day_of_week === dayOfWeek && activeIds.has(s.user_id)
    )

    // Group by time
    const timeMap = new Map<string, string[]>()
    daySlots.forEach(s => {
      const time = s.start_time.slice(0, 5)
      if (!timeMap.has(time)) timeMap.set(time, [])
      timeMap.get(time)!.push(s.user_id)
    })

    // For each time, count how many salespersons are free
    timeMap.forEach((userIds, time) => {
      const booked = (existingBookings ?? []).filter(
        b => b.booking_date === dateStr && b.start_time.slice(0, 5) === time
      )
      const bookedIds = new Set(booked.map(b => b.salesperson_id))
      const freeCount = userIds.filter(id => !bookedIds.has(id)).length

      if (freeCount > 0) {
        const [h, m] = time.split(':').map(Number)
        const endTotal = h * 60 + m + 30
        const endTime = `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`
        availableSlots.push({ date: dateStr, start_time: time, end_time: endTime, count: freeCount })
      }
    })
  }

  // Skip today's slots that are already in the past
  const nowTime = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`
  const filtered = availableSlots.filter(s => {
    if (s.date === todayStr && s.start_time <= nowTime) return false
    return true
  })

  return <BookingClient availableSlots={filtered} />
}
