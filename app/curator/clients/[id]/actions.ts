'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function assertCurator() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' as const, curatorId: null, userId: null, role: null }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') {
    return { error: 'Нет доступа' as const, curatorId: null, userId: null, role: null }
  }
  const admin = await createAdminClient()
  const { data: curator } = await admin.from('curators').select('id').eq('user_id', user.id).maybeSingle()
  return { error: null, curatorId: curator?.id || null, userId: user.id, role: profile.role }
}

async function verifyClientOwnership(admin: any, clientId: number, curatorId: string) {
  const { data: client } = await admin.from('clients').select('id, curator_id').eq('id', clientId).single()
  return client && client.curator_id === curatorId
}

export async function advanceStage(formData: FormData) {
  const { error: authErr, curatorId, userId } = await assertCurator()
  if (authErr) return { error: authErr }

  const clientId = Number(formData.get('client_id'))
  const stageCode = formData.get('stage_code') as string
  if (!clientId || !stageCode) return { error: 'Неверные данные' }

  const admin = await createAdminClient()
  if (!await verifyClientOwnership(admin, clientId, curatorId!)) return { error: 'Клиент не найден' }

  // Get stage title for activity log
  const { data: stage } = await admin.from('curator_stages').select('title').eq('code', stageCode).single()

  const { error } = await admin
    .from('clients')
    .update({ current_stage_code: stageCode })
    .eq('id', clientId)

  if (error) return { error: error.message }

  // Log activity
  await admin.from('client_activities').insert({
    client_id: clientId,
    user_id: userId,
    activity_type: 'stage_change',
    content: `Этап изменён на: ${stage?.title || stageCode}`,
  })

  revalidatePath(`/curator/clients/${clientId}`)
  revalidatePath('/curator/clients')
  revalidatePath('/curator')
  revalidatePath('/client', 'layout')
  return { success: true }
}

export async function addActivity(formData: FormData) {
  const { error: authErr, curatorId, userId } = await assertCurator()
  if (authErr) return { error: authErr }

  const clientId = Number(formData.get('client_id'))
  const content = (formData.get('content') as string)?.trim()
  if (!clientId || !content) return { error: 'Заполните заметку' }

  const admin = await createAdminClient()
  if (!await verifyClientOwnership(admin, clientId, curatorId!)) return { error: 'Клиент не найден' }

  const { error } = await admin.from('client_activities').insert({
    client_id: clientId,
    user_id: userId,
    activity_type: 'note',
    content,
  })

  if (error) return { error: error.message }

  revalidatePath(`/curator/clients/${clientId}`)
  return { success: true }
}

export async function toggleChecklist(formData: FormData) {
  const { error: authErr, curatorId, userId } = await assertCurator()
  if (authErr) return { error: authErr }

  const clientId = Number(formData.get('client_id'))
  const checklistId = formData.get('checklist_id') as string
  const isDone = formData.get('is_done') === 'true'
  if (!clientId || !checklistId) return { error: 'Неверные данные' }

  const admin = await createAdminClient()
  if (!await verifyClientOwnership(admin, clientId, curatorId!)) return { error: 'Клиент не найден' }

  const { error } = await admin
    .from('client_checklist_progress')
    .upsert({
      client_id: clientId,
      checklist_id: checklistId,
      is_done: isDone,
      done_at: isDone ? new Date().toISOString() : null,
      done_by: isDone ? userId : null,
    }, { onConflict: 'client_id,checklist_id' })

  if (error) return { error: error.message }

  revalidatePath(`/curator/clients/${clientId}`)
  revalidatePath('/client', 'layout')
  return { success: true }
}

export async function updateClientField(formData: FormData) {
  const { error: authErr, curatorId, role } = await assertCurator()
  if (authErr) return { error: authErr }

  const clientId = Number(formData.get('client_id'))
  const field = formData.get('field') as string
  const value = (formData.get('value') as string)?.trim() || null
  if (!clientId || !field) return { error: 'Неверные данные' }

  const allowed = ['country', 'university', 'telegram', 'phone', 'email', 'expected_offer_month']
  if (!allowed.includes(field)) return { error: 'Поле недоступно' }

  if (field === 'expected_offer_month' && value && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return { error: 'Некорректный месяц' }
  }

  const admin = await createAdminClient()
  // admin/rop открывают любую карточку (page.tsx), у них нет строки в curators —
  // для них пропускаем проверку владения, как в sales/actions.ts.
  const privileged = role === 'admin' || role === 'rop'
  if (!privileged && !await verifyClientOwnership(admin, clientId, curatorId!)) return { error: 'Клиент не найден' }

  const { error } = await admin.from('clients').update({ [field]: value }).eq('id', clientId)
  if (error) return { error: error.message }

  revalidatePath(`/curator/clients/${clientId}`)
  revalidatePath('/curator/clients')
  revalidatePath('/client', 'layout')
  return { success: true }
}

export async function addUniversity(formData: FormData) {
  const { error: authErr, curatorId } = await assertCurator()
  if (authErr) return { error: authErr }

  const clientId = Number(formData.get('client_id'))
  const universityName = (formData.get('university_name') as string)?.trim()
  if (!clientId || !universityName) return { error: 'Название вуза обязательно' }

  const admin = await createAdminClient()
  if (!await verifyClientOwnership(admin, clientId, curatorId!)) return { error: 'Клиент не найден' }

  const { error } = await admin.from('client_universities').insert({
    client_id: clientId,
    university_name: universityName,
    program_name: (formData.get('program_name') as string)?.trim() || null,
    country: (formData.get('country') as string)?.trim() || null,
    deadline: (formData.get('deadline') as string) || null,
    priority: Number(formData.get('priority')) || null,
    status: 'planned',
  })

  if (error) return { error: error.message }

  revalidatePath(`/curator/clients/${clientId}`)
  revalidatePath('/curator/clients')
  revalidatePath('/client', 'layout')
  return { success: true }
}

const UNI_STATUSES = ['planned', 'applied', 'offer_received', 'rejected', 'accepted'] as const

export async function updateUniversityStatus(formData: FormData) {
  const { error: authErr, curatorId } = await assertCurator()
  if (authErr) return { error: authErr }

  const clientId = Number(formData.get('client_id'))
  const uniId = formData.get('uni_id') as string
  const status = formData.get('status') as string
  if (!clientId || !uniId || !UNI_STATUSES.includes(status as any)) return { error: 'Неверные данные' }

  const admin = await createAdminClient()
  if (!await verifyClientOwnership(admin, clientId, curatorId!)) return { error: 'Клиент не найден' }

  const { error } = await admin
    .from('client_universities')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', uniId)
    .eq('client_id', clientId)
  if (error) return { error: error.message }

  revalidatePath(`/curator/clients/${clientId}`)
  revalidatePath('/client', 'layout')
  return { success: true }
}

export async function removeUniversity(formData: FormData) {
  const { error: authErr, curatorId } = await assertCurator()
  if (authErr) return { error: authErr }

  const clientId = Number(formData.get('client_id'))
  const uniId = formData.get('uni_id') as string
  if (!clientId || !uniId) return { error: 'Неверные данные' }

  const admin = await createAdminClient()
  if (!await verifyClientOwnership(admin, clientId, curatorId!)) return { error: 'Клиент не найден' }

  const { error } = await admin
    .from('client_universities')
    .delete()
    .eq('id', uniId)
    .eq('client_id', clientId)
  if (error) return { error: error.message }

  revalidatePath(`/curator/clients/${clientId}`)
  revalidatePath('/client', 'layout')
  return { success: true }
}

export async function publishShortlist(formData: FormData) {
  const { error: authErr, curatorId, userId } = await assertCurator()
  if (authErr) return { error: authErr }

  const clientId = Number(formData.get('client_id'))
  if (!clientId) return { error: 'Неверные данные' }

  const admin = await createAdminClient()
  if (!await verifyClientOwnership(admin, clientId, curatorId!)) return { error: 'Клиент не найден' }

  await admin.from('client_activities').insert({
    client_id: clientId,
    user_id: userId,
    activity_type: 'note',
    content: 'Куратор отправил подборку клиенту на ознакомление',
  })

  revalidatePath(`/curator/clients/${clientId}`)
  revalidatePath('/client', 'layout')
  return { success: true }
}
