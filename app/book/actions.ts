'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'
import { timeToMinutes, MIN_GAP_MINUTES } from '@/lib/time'
import { notifyNewBooking } from '@/lib/telegram'
import { warnOnError } from '@/lib/supabase/write-guard'
import { createBookingCore } from '@/lib/booking/create'

// Метки источника (скрытно собраны на /book). Разбор и человеческое описание —
// в lib/booking-link.ts: там же объяснено, почему адрес самой формы источником
// не считается.
function parseUtm(formData: FormData): Record<string, string> {
  try { return JSON.parse((formData.get('utm_data') as string) || '{}') || {} } catch { return {} }
}

/**
 * Запись с формы в CRM.
 *
 * Здесь только разбор формы: вся механика — в `createBookingCore`, потому что
 * та же запись приходит и с сайта, и расходиться этим двум путям нельзя.
 */
export async function createBooking(formData: FormData) {
  const quizRaw = (formData.get('quiz_data') as string) || '{}'
  let quizData: Record<string, any> = {}
  try { quizData = JSON.parse(quizRaw) } catch { /* пустой квиз — не повод терять запись */ }

  return createBookingCore({
    date: formData.get('date') as string,
    startTime: formData.get('start_time') as string,
    endTime: (formData.get('end_time') as string) || null,
    clientName: formData.get('client_name') as string,
    clientPhone: formData.get('client_phone') as string,
    clientTelegram: (formData.get('client_telegram') as string) || null,
    quizData,
    utm: parseUtm(formData),
    managerId: (formData.get('manager_id') as string) || null,
  })
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
  const utm = parseUtm(formData)

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
      ...utm,
    },
  }).then(warnOnError('deals · app/book/actions.ts:324'))

  // Increment round-robin
  if (assignedId && salespersons?.[0]) {
    await supabase
      .from('users')
      .update({ round_robin_count: salespersons[0].round_robin_count + 1 })
      .eq('id', assignedId).then(warnOnError('users · app/book/actions.ts:354'))
  }

  return { success: true }
}
