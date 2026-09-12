'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { warnOnError } from '@/lib/supabase/write-guard'

export async function cancelBooking(bookingId: string) {
  const supabase = await createAdminClient()

  // Найдём бронь чтобы откатить round_robin_count назначенному менеджеру.
  // Без этого его очередь «съедается» и при повторной записи следующего
  // клиента ставит другому, нарушая баланс.
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, salesperson_id, status')
    .eq('id', bookingId)
    .maybeSingle()

  if (!booking) return
  if (booking.status === 'cancelled') return  // уже отменена — не откатываем счётчик дважды

  await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', bookingId).then(warnOnError('bookings · app/book/cancel/actions.ts:23'))

  if (booking.salesperson_id) {
    const { data: u } = await supabase
      .from('users')
      .select('round_robin_count')
      .eq('id', booking.salesperson_id)
      .maybeSingle()
    const cur = u?.round_robin_count ?? 0
    if (cur > 0) {
      await supabase
        .from('users')
        .update({ round_robin_count: cur - 1 })
        .eq('id', booking.salesperson_id).then(warnOnError('users · app/book/cancel/actions.ts:36'))
    }
  }

  revalidatePath('/book/cancel')
  revalidatePath('/sales/schedule')
}
