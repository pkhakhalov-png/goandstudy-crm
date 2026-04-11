'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { normalizePhone } from '@/lib/phone'

export async function moveDeal(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const dealId = formData.get('deal_id') as string
  const stageId = formData.get('stage_id') as string
  const oldStageName = formData.get('old_stage_name') as string
  const newStageName = formData.get('new_stage_name') as string

  const { error } = await supabase
    .from('deals')
    .update({ stage_id: stageId, updated_at: new Date().toISOString() })
    .eq('id', dealId)

  if (error) return { error: error.message }

  // Log activity
  await supabase.from('deal_activities').insert({
    deal_id: dealId,
    user_id: user.id,
    activity_type: 'stage_change',
    content: `${oldStageName} → ${newStageName}`,
    metadata: { from_stage: oldStageName, to_stage: newStageName },
  })

  revalidatePath('/admin/funnel')
  revalidatePath('/sales/funnel')
  return { success: true }
}

export async function createDeal(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const title = (formData.get('title') as string)?.trim()
  const contactName = (formData.get('contact_name') as string)?.trim()
  const contactPhone = (formData.get('contact_phone') as string)?.trim() || null
  const contactTelegram = (formData.get('contact_telegram') as string)?.trim() || null
  const stageId = formData.get('stage_id') as string
  const salespersonId = formData.get('salesperson_id') as string || user.id
  const budget = Number(formData.get('budget') || 0)

  if (!title || !contactName) return { error: 'Заполните название и имя контакта' }

  // Check for duplicate by phone
  const normalized = normalizePhone(contactPhone)
  if (normalized) {
    const { data: allDeals } = await supabase.from('deals').select('id, contact_name, contact_phone, contact_telegram, contact_email, contact_whatsapp')
    const duplicate = allDeals?.find(d => normalizePhone(d.contact_phone) === normalized)
    if (duplicate) {
      // Merge into existing deal
      const updates: Record<string, any> = { updated_at: new Date().toISOString() }
      if (!duplicate.contact_telegram && contactTelegram) updates.contact_telegram = contactTelegram
      if (budget > 0) updates.budget = budget
      await supabase.from('deals').update(updates).eq('id', duplicate.id)

      await supabase.from('deal_activities').insert({
        deal_id: duplicate.id,
        user_id: user.id,
        activity_type: 'system',
        content: `Дубль объединён: ${contactName} (${contactPhone})`,
      })

      revalidatePath('/admin/funnel')
      revalidatePath('/sales/funnel')
      return { success: true, merged: true }
    }
  }

  const { data: deal, error } = await supabase.from('deals').insert({
    title: title,
    stage_id: stageId,
    salesperson_id: salespersonId,
    contact_name: contactName,
    contact_phone: contactPhone,
    contact_telegram: contactTelegram,
    budget,
    source: 'manual',
  }).select('id').single()

  if (error) return { error: error.message }

  await supabase.from('deal_activities').insert({
    deal_id: deal.id,
    user_id: user.id,
    activity_type: 'system',
    content: 'Сделка создана',
  })

  revalidatePath('/admin/funnel')
  revalidatePath('/sales/funnel')
  return { success: true }
}

export async function addDealNote(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const dealId = formData.get('deal_id') as string
  const content = (formData.get('content') as string)?.trim()

  if (!content) return { error: 'Введите текст заметки' }

  await supabase.from('deal_activities').insert({
    deal_id: dealId,
    user_id: user.id,
    activity_type: 'note',
    content,
  })

  await supabase.from('deals').update({ updated_at: new Date().toISOString() }).eq('id', dealId)

  revalidatePath('/admin/funnel')
  revalidatePath('/sales/funnel')
  return { success: true }
}

export async function updateStage(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const stageId = formData.get('stage_id') as string
  const name = formData.get('name') as string | null
  const color = formData.get('color') as string | null

  const updates: Record<string, string> = {}
  if (name) updates.name = name.trim()
  if (color) updates.color = color

  const { error } = await supabase.from('pipeline_stages').update(updates).eq('id', stageId)
  if (error) return { error: error.message }

  revalidatePath('/admin/funnel')
  revalidatePath('/sales/funnel')
  return { success: true }
}

export async function updateDeal(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const dealId = formData.get('deal_id') as string
  const updates: Record<string, any> = { updated_at: new Date().toISOString() }

  const fields = ['contact_name', 'contact_phone', 'contact_telegram', 'contact_email', 'contact_whatsapp', 'budget', 'title', 'salesperson_id']
  fields.forEach(f => {
    const val = formData.get(f)
    if (val !== null) updates[f] = f === 'budget' ? Number(val) : (val as string).trim() || null
  })

  const { error } = await supabase.from('deals').update(updates).eq('id', dealId)
  if (error) return { error: error.message }

  revalidatePath('/admin/funnel')
  revalidatePath('/sales/funnel')
  return { success: true }
}
