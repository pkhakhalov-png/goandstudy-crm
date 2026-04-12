'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveWeekSlots(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const slotsJson = formData.get('slots') as string
  const slots: { day_of_week: number; start_time: string; end_time: string }[] = JSON.parse(slotsJson)

  // Delete all existing slots for this user
  await supabase.from('schedule_slots').delete().eq('user_id', user.id)

  // Insert new slots
  if (slots.length > 0) {
    const rows = slots.map(s => ({
      user_id: user.id,
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      is_active: true,
    }))
    const { error } = await supabase.from('schedule_slots').insert(rows)
    if (error) return { error: error.message }
  }

  revalidatePath('/sales/schedule')
  return { success: true }
}

export async function updateBookingStatus(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const bookingId = formData.get('booking_id') as string
  const status = formData.get('status') as string

  const { error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', bookingId)
    .eq('salesperson_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/sales/schedule')
  return { success: true }
}
