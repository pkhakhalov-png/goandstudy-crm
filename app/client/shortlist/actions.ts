'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient, createClient as createSsrClient } from '@/lib/supabase/server'
import { autoLinkGlobalDocs } from '@/app/client/applications/[id]/wizard/auto-link-helper'

type ApplyResult =
  | { ok: true; applicationId: string; hasWizard: boolean }
  | { ok: false; error: string }

/**
 * Создать заявку из шортлиста клиента.
 * Если у школы есть school_application_profiles запись — привязываем + автолинк
 * глобальных документов + redirect на wizard. Иначе — обычная заявка для куратора.
 */
export async function applyFromShortlist(opts: {
  schoolId?: number | null
  schoolName: string
  programId?: number | null
  programName?: string | null
  country?: string | null
  level?: 'bachelor' | 'master' | 'phd'
}): Promise<ApplyResult> {
  const ssr = await createSsrClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) return { ok: false, error: 'Не авторизован' }

  const admin = await createAdminClient()
  const { data: profileUser } = await admin.from('users').select('role').eq('id', user.id).single()
  const role = profileUser?.role

  // Находим клиента (только клиент создаёт заявку для себя)
  let clientId: number | null = null
  if (role === 'client') {
    const { data: client } = await admin
      .from('clients').select('id').eq('email', user.email!).maybeSingle()
    clientId = client?.id ?? null
  }
  if (!clientId) return { ok: false, error: 'Клиент не определён' }

  // Ищем school_application_profile (по school_id или по точному name)
  const level = opts.level || 'bachelor'
  let profileQuery = admin
    .from('school_application_profiles')
    .select('id, school_name')
    .eq('level', level)
    .eq('is_active', true)
  if (opts.schoolId) {
    profileQuery = profileQuery.or(`school_id.eq.${opts.schoolId},school_name.ilike.${opts.schoolName.replace(/[%,]/g, ' ')}`)
  } else {
    profileQuery = profileQuery.ilike('school_name', opts.schoolName.replace(/[%,]/g, ' '))
  }
  const { data: profileRows } = await profileQuery.limit(1)
  const profile = profileRows?.[0] ?? null

  // Не плодим дубли — если уже есть заявка для этой школы, возвращаем её
  let existingQuery = admin
    .from('client_applications')
    .select('id, profile_id')
    .eq('client_id', clientId)
  if (opts.schoolId) {
    existingQuery = existingQuery.or(`school_id.eq.${opts.schoolId},university_name.ilike.${opts.schoolName.replace(/[%,]/g, ' ')}`)
  } else {
    existingQuery = existingQuery.ilike('university_name', opts.schoolName.replace(/[%,]/g, ' '))
  }
  const { data: existing } = await existingQuery.limit(1)
  if (existing?.[0]) {
    return {
      ok: true,
      applicationId: existing[0].id,
      hasWizard: !!existing[0].profile_id,
    }
  }

  // Создаём новую заявку
  const { data: app, error } = await admin
    .from('client_applications')
    .insert({
      client_id: clientId,
      profile_id: profile?.id ?? null,
      school_id: opts.schoolId ?? null,
      university_name: opts.schoolName,
      program_name: opts.programName ?? null,
      country: opts.country ?? null,
      stage: 'created',
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  // Если есть паспорт — заводим application_profile_data + автолинк документов
  if (profile) {
    await admin.from('application_profile_data').insert({
      application_id: app.id,
      data: {},
    })
    await autoLinkGlobalDocs(app.id)
  }

  // Event
  await admin.from('application_events').insert({
    application_id: app.id,
    event_type: 'stage_change',
    content: 'Клиент инициировал подачу из подборки',
    payload: { source: 'shortlist', from_stage: null, to_stage: 'created' },
    author_id: user.id,
  })

  revalidatePath('/client/shortlist')
  revalidatePath('/client')
  revalidatePath(`/curator/clients/${clientId}`)

  return { ok: true, applicationId: app.id, hasWizard: !!profile }
}
