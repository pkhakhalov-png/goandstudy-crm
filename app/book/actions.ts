'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'

export async function createBooking(formData: FormData) {
  const supabase = await createAdminClient()

  const date = formData.get('date') as string
  const startTime = formData.get('start_time') as string
  const endTime = formData.get('end_time') as string
  const clientName = (formData.get('client_name') as string)?.trim()
  const clientPhone = (formData.get('client_phone') as string)?.trim()
  const clientTelegram = (formData.get('client_telegram') as string)?.trim() || null

  if (!date || !startTime || !endTime) return { error: 'Выберите дату и время' }
  if (!clientName) return { error: 'Укажите имя' }
  if (!clientPhone) return { error: 'Укажите телефон' }

  // Normalize time to HH:mm:ss
  const st = startTime.length === 5 ? startTime + ':00' : startTime
  const et = endTime.length === 5 ? endTime + ':00' : endTime

  const bookingDate = new Date(date + 'T00:00:00')
  const dayOfWeek = (bookingDate.getDay() + 6) % 7 // Mon=0

  console.log('[BOOK] date:', date, 'dayOfWeek:', dayOfWeek, 'time:', st)

  // 1. Find ALL schedule_slots for this day+time (any salesperson)
  const { data: allSlots, error: slotErr } = await supabase
    .from('schedule_slots')
    .select('user_id, start_time, day_of_week')
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)

  console.log('[BOOK] all slots for day', dayOfWeek, ':', allSlots?.length, 'error:', slotErr?.message)

  // Filter by time in JS to avoid format mismatch
  const matchingSlots = (allSlots ?? []).filter(s => s.start_time.slice(0, 5) === startTime.slice(0, 5))

  console.log('[BOOK] matching time', startTime.slice(0, 5), ':', matchingSlots.length)

  if (matchingSlots.length === 0) {
    return { error: 'Это время больше не доступно' }
  }

  const userIds = matchingSlots.map(s => s.user_id)

  // 2. Check which salespersons are active
  const { data: activeUsers } = await supabase
    .from('users')
    .select('id, round_robin_count')
    .in('id', userIds)
    .eq('is_active', true)
    .eq('role', 'salesperson')

  if (!activeUsers || activeUsers.length === 0) {
    return { error: 'Нет активных менеджеров на это время' }
  }

  const activeIds = activeUsers.map(u => u.id)

  // 3. Filter out those who already have a booking at this date+time
  const { data: existingBookings } = await supabase
    .from('bookings')
    .select('salesperson_id')
    .eq('booking_date', date)
    .in('salesperson_id', activeIds)
    .neq('status', 'cancelled')

  // Compare times in JS to avoid format issues
  const bookedIds = new Set(
    (existingBookings ?? [])
      .filter(b => (b as any).start_time?.slice(0, 5) === startTime.slice(0, 5))
      .map(b => b.salesperson_id)
  )

  // Wait, we need start_time in the bookings query too
  const { data: exactBookings } = await supabase
    .from('bookings')
    .select('salesperson_id, start_time')
    .eq('booking_date', date)
    .in('salesperson_id', activeIds)
    .neq('status', 'cancelled')

  const exactBookedIds = new Set(
    (exactBookings ?? [])
      .filter(b => b.start_time.slice(0, 5) === startTime.slice(0, 5))
      .map(b => b.salesperson_id)
  )

  const freeIds = activeIds.filter(id => !exactBookedIds.has(id))

  console.log('[BOOK] active:', activeIds.length, 'booked:', exactBookedIds.size, 'free:', freeIds.length)

  if (freeIds.length === 0) {
    return { error: 'Все менеджеры заняты на это время, выберите другое' }
  }

  // 4. Round-robin: pick the one with lowest count
  const freeUsers = activeUsers
    .filter(u => freeIds.includes(u.id))
    .sort((a, b) => a.round_robin_count - b.round_robin_count)

  const assignedUser = freeUsers[0]

  // 5. Create booking
  const { data: insertedBooking, error: bookErr } = await supabase.from('bookings').insert({
    salesperson_id: assignedUser.id,
    booking_date: date,
    start_time: st,
    end_time: et,
    client_name: clientName,
    client_phone: clientPhone,
    client_telegram: clientTelegram,
  }).select('id').single()

  if (bookErr) {
    console.log('[BOOK] insert error:', bookErr.message, bookErr.code)
    if (bookErr.code === '23505') {
      return { error: 'Это время уже занято, выберите другое' }
    }
    return { error: bookErr.message }
  }

  // 6. Increment round-robin counter
  await supabase
    .from('users')
    .update({ round_robin_count: assignedUser.round_robin_count + 1 })
    .eq('id', assignedUser.id)

  // 7. Auto-create deal in funnel (with dedup)
  try {
    const normalizedPhone = normalizePhone(clientPhone)

    // Check for existing deal with same phone
    let existingDeal = null
    if (normalizedPhone) {
      const { data: allDeals } = await supabase.from('deals').select('id, contact_name, contact_phone, contact_telegram, booking_id')
      existingDeal = allDeals?.find(d => normalizePhone(d.contact_phone) === normalizedPhone) || null
    }

    if (existingDeal) {
      // Merge: update existing deal with new info where missing
      const updates: Record<string, any> = { updated_at: new Date().toISOString() }
      if (!existingDeal.contact_telegram && clientTelegram) updates.contact_telegram = clientTelegram
      if (!existingDeal.booking_id && insertedBooking?.id) updates.booking_id = insertedBooking.id
      await supabase.from('deals').update(updates).eq('id', existingDeal.id)

      // Log merge activity
      await supabase.from('deal_activities').insert({
        deal_id: existingDeal.id,
        activity_type: 'system',
        content: `Повторная запись объединена (${clientName}, ${clientPhone})`,
      })
    } else {
      // Create new deal
      const { data: firstStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('is_active', true)
        .order('position', { ascending: true })
        .limit(1)
        .single()

      if (firstStage) {
        await supabase.from('deals').insert({
          title: `Заявка от ${clientName}`,
          stage_id: firstStage.id,
          salesperson_id: assignedUser.id,
          contact_name: clientName,
          contact_phone: clientPhone,
          contact_telegram: clientTelegram,
          source: 'booking',
          booking_id: insertedBooking?.id || null,
        })
      }
    }
  } catch {}

  console.log('[BOOK] success! assigned to:', assignedUser.id)

  return { success: true, bookingId: insertedBooking?.id }
}
