import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { mskTodayStr, mskTimeStr, mskAddDays, mskDayOfWeek } from '@/lib/time'

export async function GET() {
  const supabase = await createAdminClient()

  const todayStr = mskTodayStr()
  const futureStr = mskAddDays(30)

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

  const nowTime = mskTimeStr()

  for (let d = 0; d < 30; d++) {
    const dateStr = mskAddDays(d)
    const dayOfWeek = mskDayOfWeek(dateStr)

    const daySlots = (allSlots ?? []).filter(s => s.day_of_week === dayOfWeek && activeIds.has(s.user_id))
    const timeMap = new Map<string, string[]>()
    daySlots.forEach(s => {
      const time = s.start_time.slice(0, 5)
      if (!timeMap.has(time)) timeMap.set(time, [])
      timeMap.get(time)!.push(s.user_id)
    })

    const times: string[] = []

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
