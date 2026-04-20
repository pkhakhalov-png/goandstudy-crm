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
  const quizDataRaw = formData.get('quiz_data') as string || '{}'
  let quizData: Record<string, any> = {}
  try { quizData = JSON.parse(quizDataRaw) } catch {}

  const fixedManagerId = (formData.get('manager_id') as string)?.trim() || null

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

  // 4. Pick salesperson: fixed manager or round-robin
  let assignedUser: { id: string; round_robin_count: number }

  if (fixedManagerId && freeIds.includes(fixedManagerId)) {
    assignedUser = activeUsers.find(u => u.id === fixedManagerId)!
  } else {
    const freeUsers = activeUsers
      .filter(u => freeIds.includes(u.id))
      .sort((a, b) => a.round_robin_count - b.round_robin_count)
    assignedUser = freeUsers[0]
  }

  if (!assignedUser) return { error: 'Менеджер недоступен на это время' }

  // 5. Delete any cancelled bookings for this slot so unique constraint doesn't block
  await supabase
    .from('bookings')
    .delete()
    .eq('salesperson_id', assignedUser.id)
    .eq('booking_date', date)
    .eq('start_time', st)
    .eq('status', 'cancelled')

  // 6. Create booking
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

  // 7. Auto-create deal in funnel (with dedup via indexed phone_normalized)
  try {
    const normalizedPhone = normalizePhone(clientPhone)

    let existingDeal = null
    if (normalizedPhone) {
      const { data } = await supabase
        .from('deals')
        .select('id, contact_telegram, booking_id')
        .eq('phone_normalized', normalizedPhone)
        .is('deleted_at', null)
        .limit(1)
        .single()
      existingDeal = data
    }

    if (existingDeal) {
      const updates: Record<string, any> = { updated_at: new Date().toISOString() }
      if (!existingDeal.contact_telegram && clientTelegram) updates.contact_telegram = clientTelegram
      if (!existingDeal.booking_id && insertedBooking?.id) updates.booking_id = insertedBooking.id
      await supabase.from('deals').update(updates).eq('id', existingDeal.id)

      await supabase.from('deal_activities').insert({
        deal_id: existingDeal.id,
        activity_type: 'system',
        content: `Повторная запись объединена (${clientName}, ${clientPhone})`,
      })
    } else {
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
          phone_normalized: normalizedPhone,
          source: 'booking',
          booking_id: insertedBooking?.id || null,
          custom_fields: {
            quiz_age: quizData.age,
            quiz_status: quizData.status,
            quiz_budget: quizData.budget,
            quiz_about: quizData.about,
            quiz_degree: quizData.degree,
            quiz_format: quizData.format,
            quiz_country: quizData.country,
            quiz_year: quizData.year,
            quiz_stage: quizData.stage,
            quiz_result: quizData.result,
            quiz_consultation_format: quizData.consultation_format,
          },
        })
      }
    }
  } catch {}

  console.log('[BOOK] success! assigned to:', assignedUser.id)

  return { success: true, bookingId: insertedBooking?.id }
}

export async function createLowBudgetDeal(formData: FormData) {
  const supabase = await createAdminClient()

  const clientName = (formData.get('client_name') as string)?.trim()
  const clientPhone = (formData.get('client_phone') as string)?.trim()
  const clientTelegram = (formData.get('client_telegram') as string)?.trim() || null
  const channel = (formData.get('channel') as string) || 'telegram'
  const quizDataRaw = formData.get('quiz_data') as string || '{}'
  let quizData: Record<string, any> = {}
  try { quizData = JSON.parse(quizDataRaw) } catch {}

  if (!clientName || !clientPhone) return { error: 'Нет данных' }

  const normalizedPhone = normalizePhone(clientPhone)

  // Check for existing deal
  if (normalizedPhone) {
    const { data: existing } = await supabase
      .from('deals')
      .select('id')
      .eq('phone_normalized', normalizedPhone)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    if (existing) return { success: true }
  }

  // Round-robin salesperson
  const { data: salespersons } = await supabase
    .from('users')
    .select('id, round_robin_count')
    .eq('role', 'salesperson')
    .eq('is_active', true)
    .order('round_robin_count', { ascending: true })
    .limit(1)

  const assignedId = salespersons?.[0]?.id ?? null

  const { data: firstStage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('is_active', true)
    .order('position', { ascending: true })
    .limit(1)
    .single()

  if (!firstStage) return { error: 'Нет этапов воронки' }

  await supabase.from('deals').insert({
    title: `Заявка от ${clientName}`,
    stage_id: firstStage.id,
    salesperson_id: assignedId,
    contact_name: clientName,
    contact_phone: clientPhone,
    contact_telegram: clientTelegram,
    phone_normalized: normalizedPhone,
    source: 'website',
    custom_fields: {
      quiz_age: quizData.age,
      quiz_status: quizData.status,
      quiz_budget: quizData.budget,
      quiz_about: quizData.about,
      quiz_degree: quizData.degree,
      quiz_format: quizData.format,
      quiz_country: quizData.country,
      quiz_year: quizData.year,
      quiz_stage: quizData.stage,
      quiz_result: quizData.result,
      quiz_consultation_format: quizData.consultation_format,
      redirect_channel: channel,
      low_budget: true,
    },
  })

  // Increment round-robin
  if (assignedId && salespersons?.[0]) {
    await supabase
      .from('users')
      .update({ round_robin_count: salespersons[0].round_robin_count + 1 })
      .eq('id', assignedId)
  }

  return { success: true }
}
