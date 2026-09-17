/**
 * Запись на консультацию: единственное место, где она создаётся.
 *
 * Зачем отдельный модуль. Форма живёт в двух местах — на crm.goandstudy.com и
 * на самом сайте, — а механика должна быть одна: назначение продажника по
 * кругу, зазор между консультациями, сделка в воронке, склейка с существующей
 * по телефону, касание для атрибуции и уведомление менеджеру. Две копии этой
 * логики разойдутся через месяц, и разойдутся молча: в одной форме сделка
 * создаётся, в другой нет.
 *
 * Отсюда правило: и серверное действие CRM, и публичный приём заявок с сайта
 * вызывают одну и ту же функцию и не делают ничего своего.
 */
import { createAdminClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'
import { timeToMinutes, MIN_GAP_MINUTES } from '@/lib/time'
import { notifyNewBooking } from '@/lib/telegram'
import { warnOnError } from '@/lib/supabase/write-guard'
import { describeBookSource, pageTitleFor } from '@/lib/booking-link'

export type BookingInput = {
  date: string
  startTime: string
  endTime?: string | null
  clientName: string
  clientPhone: string
  clientTelegram?: string | null
  /** Ответы квиза: страна, уровень, бюджет и прочее. */
  quizData?: Record<string, any>
  /** Метки источника — откуда человек пришёл. */
  utm?: Record<string, string>
  /** Закреплённый менеджер, если запись идёт по его личной ссылке. */
  managerId?: string | null
}

export type BookingResult = { success?: true; bookingId?: string; error?: string }

export async function createBookingCore(input: BookingInput): Promise<BookingResult> {
  const supabase = await createAdminClient()

  const date = input.date
  const startTime = input.startTime
  const clientName = input.clientName?.trim()
  const clientPhone = input.clientPhone?.trim()
  const clientTelegram = input.clientTelegram?.trim() || null
  const quizData: Record<string, any> = input.quizData ?? {}
  const utm: Record<string, string> = input.utm ?? {}
  const fixedManagerId = input.managerId?.trim() || null

  if (!date || !startTime) return { error: 'Выберите дату и время' }
  if (!clientName) return { error: 'Укажите имя' }
  if (!clientPhone) return { error: 'Укажите телефон' }

  const st = startTime.length === 5 ? `${startTime}:00` : startTime
  const et = input.endTime
    ? (input.endTime.length === 5 ? `${input.endTime}:00` : input.endTime)
    : (() => {
        const [h, m] = startTime.split(':').map(Number)
        const t = h * 60 + m + 30
        return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}:00`
      })()

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
    .select('id, name, round_robin_count, telegram_username')
    .in('id', userIds)
    .eq('is_active', true)
    .eq('role', 'salesperson')

  if (!activeUsers || activeUsers.length === 0) {
    return { error: 'Нет активных менеджеров на это время' }
  }

  const activeIds = activeUsers.map(u => u.id)

  // 3. Все брони продажников этого дня — отсекаем тех, у кого занят слот
  //    или есть бронь в пределах ±60 минут (минимальный зазор между консультациями).
  const { data: exactBookings } = await supabase
    .from('bookings')
    .select('salesperson_id, start_time')
    .eq('booking_date', date)
    .in('salesperson_id', activeIds)
    .neq('status', 'cancelled')

  const wantedMin = timeToMinutes(startTime)
  const conflictIds = new Set(
    (exactBookings ?? [])
      .filter(b => Math.abs(timeToMinutes(b.start_time) - wantedMin) < MIN_GAP_MINUTES)
      .map(b => b.salesperson_id)
  )

  const freeIds = activeIds.filter(id => !conflictIds.has(id))

  console.log('[BOOK] active:', activeIds.length, 'conflict:', conflictIds.size, 'free:', freeIds.length)

  if (freeIds.length === 0) {
    return { error: 'Все менеджеры заняты на это время, выберите другое' }
  }

  // 4. Pick salesperson: fixed manager or round-robin
  type AssignedUser = { id: string; name: string | null; round_robin_count: number; telegram_username: string | null }
  let assignedUser: AssignedUser

  if (fixedManagerId && freeIds.includes(fixedManagerId)) {
    assignedUser = activeUsers.find(u => u.id === fixedManagerId)! as AssignedUser
  } else {
    const freeUsers = activeUsers
      .filter(u => freeIds.includes(u.id))
      .sort((a, b) => a.round_robin_count - b.round_robin_count)
    assignedUser = freeUsers[0] as AssignedUser
  }

  if (!assignedUser) return { error: 'Менеджер недоступен на это время' }

  // 5. Зачищаем мёртвые записи (cancelled / no_show) для этого слота, иначе
  //    UNIQUE(salesperson_id, booking_date, start_time) заблокирует INSERT.
  const { error: delErr, count: delCount } = await supabase
    .from('bookings')
    .delete({ count: 'exact' })
    .eq('salesperson_id', assignedUser.id)
    .eq('booking_date', date)
    .eq('start_time', st)
    .in('status', ['cancelled', 'no_show'])
  console.log('[BOOK] cleanup stale rows for slot:', delCount ?? 0, 'err:', delErr?.message ?? 'none')

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

  // Откуда человек пришёл — знаем только здесь и только сейчас. Пишем касание
  // сразу, но так, чтобы сбой статистики не мешал записи клиента.
  if (insertedBooking?.id) {
    try {
      const { recordBookingTouch } = await import('@/lib/seo/attribution')
      const { createAdminClient } = await import('@/lib/supabase/server')
      const seo = (await createAdminClient()).schema('seo')
      const touch = await recordBookingTouch(seo, { bookingId: insertedBooking.id, utm, anonId: utm.anon_id ?? null })
      console.log('[BOOK] касание записано:', touch.ok ? (touch.page ?? 'страница не наша') : touch.why)
    } catch (e: any) {
      console.log('[BOOK] касание не записалось:', e?.message)
    }
  }

  if (bookErr) {
    console.error('[BOOK] insert FAILED:', { code: bookErr.code, msg: bookErr.message, salesperson: assignedUser.id, date, time: st })
    if (bookErr.code === '23505') {
      // Последний шанс: возможно остался некий confirmed-row не от нашего юзера —
      // вернём чёткое сообщение.
      return { error: 'Это время уже занято, выберите другое' }
    }
    return { error: bookErr.message }
  }
  console.log('[BOOK] insert OK:', { id: insertedBooking?.id, salesperson: assignedUser.id, date, time: st })

  // 6. Increment round-robin counter
  await supabase
    .from('users')
    .update({ round_robin_count: assignedUser.round_robin_count + 1 })
    .eq('id', assignedUser.id).then(warnOnError('users · app/book/actions.ts:172'))

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
      await supabase.from('deals').update(updates).eq('id', existingDeal.id).then(warnOnError('deals · app/book/actions.ts:195'))

      await supabase.from('deal_activities').insert({
        deal_id: existingDeal.id,
        activity_type: 'system',
        content: `Повторная запись объединена (${clientName}, ${clientPhone})`,
      }).then(warnOnError('deal_activities · app/book/actions.ts:197'))
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
            ...utm,
          },
        }).then(warnOnError('deals · app/book/actions.ts:212')).then(warnOnError('deals · сделка по заявке с сайта'))
      }
    }
  } catch {}

  console.log('[BOOK] success! assigned to:', assignedUser.id)

  // 8. Уведомление в TG-группу (не блокируем — fire-and-forget с логом ошибок)
  try {
    const quizParts: string[] = []
    if (quizData.country) quizParts.push(`Страна: ${quizData.country}`)
    if (quizData.degree) quizParts.push(`Уровень: ${quizData.degree}`)
    if (quizData.budget) quizParts.push(`Бюджет: ${quizData.budget}`)
    if (quizData.year) quizParts.push(`Год: ${quizData.year}`)
    const quizSummary = quizParts.length > 0 ? quizParts.join(' · ') : null

    // Сначала заголовок, потом описание: зная название страницы, описание
    // становится короче и понятнее.
    const pageTitle = await pageTitleFor(describeBookSource(utm).url)
    const origin = describeBookSource(utm, pageTitle)

    console.log('[BOOK] TG notify start:', { salesperson: assignedUser.name, tg: assignedUser.telegram_username, date, time: st })
    await notifyNewBooking({
      salespersonName: assignedUser.name || `User ${assignedUser.id.slice(0, 8)}`,
      salespersonTgUsername: assignedUser.telegram_username,
      date,
      startTime: st.slice(0, 5),
      endTime: et.slice(0, 5),
      clientName,
      clientPhone,
      clientTelegram,
      quizSummary,
      source: origin.where,
      page: origin.url,
    })
    console.log('[BOOK] TG notify done')
  } catch (e) {
    console.error('[BOOK] TG notify failed:', e)
  }

  return { success: true, bookingId: insertedBooking?.id }
}
