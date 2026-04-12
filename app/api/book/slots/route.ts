import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createAdminClient()

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const futureDate = new Date(today)
  futureDate.setDate(futureDate.getDate() + 30)
  const futureStr = futureDate.toISOString().split('T')[0]

  const [
    { data: allSlots },
    { data: existingBookings },
    { data: activeSalespersons },
  ] = await Promise.all([
    supabase.from('schedule_slots').select('user_id, day_of_week, start_time, end_time').eq('is_active', true),
    supabase.from('bookings').select('salesperson_id, booking_date, start_time').gte('booking_date', todayStr).lte('booking_date', futureStr).neq('status', 'cancelled'),
    supabase.from('users').select('id').eq('role', 'salesperson').eq('is_active', true),
  ])

  const activeIds = new Set(activeSalespersons?.map(u => u.id) ?? [])
  const result: Record<string, string[]> = {}

  for (let d = 0; d < 30; d++) {
    const date = new Date(today)
    date.setDate(today.getDate() + d)
    const dateStr = date.toISOString().split('T')[0]
    const dayOfWeek = (date.getDay() + 6) % 7

    const daySlots = (allSlots ?? []).filter(s => s.day_of_week === dayOfWeek && activeIds.has(s.user_id))
    const timeMap = new Map<string, string[]>()
    daySlots.forEach(s => {
      const time = s.start_time.slice(0, 5)
      if (!timeMap.has(time)) timeMap.set(time, [])
      timeMap.get(time)!.push(s.user_id)
    })

    const times: string[] = []
    const nowTime = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`

    timeMap.forEach((userIds, time) => {
      if (dateStr === todayStr && time <= nowTime) return
      const booked = (existingBookings ?? []).filter(b => b.booking_date === dateStr && b.start_time.slice(0, 5) === time)
      const freeCount = userIds.filter(id => !new Set(booked.map(b => b.salesperson_id)).has(id)).length
      if (freeCount > 0) times.push(time)
    })

    if (times.length > 0) result[dateStr] = times.sort()
  }

  return NextResponse.json({ dates: result })
}
