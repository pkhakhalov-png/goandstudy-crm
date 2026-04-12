import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { date, start_time, end_time, client_name, client_phone, client_telegram } = body

  if (!date || !start_time || !client_name || !client_phone) {
    return NextResponse.json({ error: 'Заполните обязательные поля' }, { status: 400 })
  }

  const supabase = await createAdminClient()
  const bookingDate = new Date(date + 'T00:00:00')
  const dayOfWeek = (bookingDate.getDay() + 6) % 7

  const st = start_time.length === 5 ? start_time + ':00' : start_time
  const et = end_time ? (end_time.length === 5 ? end_time + ':00' : end_time) : (() => {
    const [h, m] = start_time.split(':').map(Number)
    const t = h * 60 + m + 30
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}:00`
  })()

  const { data: availableSlots } = await supabase
    .from('schedule_slots')
    .select('user_id')
    .eq('day_of_week', dayOfWeek)
    .eq('start_time', st)
    .eq('is_active', true)

  if (!availableSlots || availableSlots.length === 0) {
    return NextResponse.json({ error: 'Это время не доступно' }, { status: 400 })
  }

  const userIds = availableSlots.map(s => s.user_id)

  const { data: existingBookings } = await supabase
    .from('bookings')
    .select('salesperson_id')
    .eq('booking_date', date)
    .eq('start_time', st)
    .neq('status', 'cancelled')
    .in('salesperson_id', userIds)

  const bookedIds = new Set(existingBookings?.map(b => b.salesperson_id) ?? [])
  const freeIds = userIds.filter(id => !bookedIds.has(id))

  if (freeIds.length === 0) {
    return NextResponse.json({ error: 'Время уже занято' }, { status: 409 })
  }

  const { data: candidates } = await supabase
    .from('users')
    .select('id, round_robin_count')
    .in('id', freeIds)
    .eq('is_active', true)
    .order('round_robin_count', { ascending: true })
    .limit(1)

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ error: 'Нет доступных менеджеров' }, { status: 500 })
  }

  const assignedId = candidates[0].id

  const { error: bookErr } = await supabase.from('bookings').insert({
    salesperson_id: assignedId,
    booking_date: date,
    start_time: st,
    end_time: et,
    client_name, client_phone,
    client_telegram: client_telegram || null,
  })

  if (bookErr) {
    if (bookErr.code === '23505') return NextResponse.json({ error: 'Время уже занято' }, { status: 409 })
    return NextResponse.json({ error: bookErr.message }, { status: 500 })
  }

  await supabase.from('users').update({ round_robin_count: candidates[0].round_robin_count + 1 }).eq('id', assignedId)

  return NextResponse.json({ success: true })
}
