'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient, createClient as createSsrClient } from '@/lib/supabase/server'

type AccessResult =
  | { ok: false; error: string }
  | { ok: true; admin: Awaited<ReturnType<typeof createAdminClient>>; user: { id: string; email?: string }; role: string | undefined; app: { id: string; client_id: number } }

async function checkAccess(applicationId: string): Promise<AccessResult> {
  const ssr = await createSsrClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) return { ok: false, error: 'Не авторизован' }

  const admin = await createAdminClient()
  const { data: profile } = await admin.from('users').select('role').eq('id', user.id).single()
  const role = profile?.role

  const { data: app } = await admin
    .from('client_applications')
    .select('id, client_id')
    .eq('id', applicationId)
    .maybeSingle()
  if (!app) return { ok: false, error: 'Заявка не найдена' }

  if (role === 'client') {
    const { data: client } = await admin
      .from('clients').select('id').eq('email', user.email!).maybeSingle()
    if (!client || client.id !== app.client_id) return { ok: false, error: 'Нет доступа' }
  } else if (role !== 'admin' && role !== 'curator' && role !== 'rop') {
    return { ok: false, error: 'Нет доступа' }
  }

  return { ok: true, admin, user: { id: user.id, email: user.email }, role, app }
}

export async function saveApplicationProfileData(opts: {
  applicationId: string
  data: Record<string, string>
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await checkAccess(opts.applicationId)
  if (!ctx.ok) return { ok: false, error: ctx.error }

  const { error } = await ctx.admin
    .from('application_profile_data')
    .upsert({
      application_id: opts.applicationId,
      data: opts.data,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'application_id' })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/client/applications/${opts.applicationId}/wizard`)
  return { ok: true }
}

export async function markApplicationReadyForCurator(opts: {
  applicationId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await checkAccess(opts.applicationId)
  if (!ctx.ok) return { ok: false, error: ctx.error }

  const { error } = await ctx.admin
    .from('client_applications')
    .update({
      stage: 'submitted',
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', opts.applicationId)
  if (error) return { ok: false, error: error.message }

  await ctx.admin.from('application_events').insert({
    application_id: opts.applicationId,
    event_type: 'stage_change',
    content: 'Заявка отправлена клиентом — ожидает обработки куратором',
    payload: { from_stage: 'created', to_stage: 'submitted', source: 'client_wizard' },
    author_id: ctx.user.id,
  })

  revalidatePath(`/client/applications/${opts.applicationId}/wizard`)
  revalidatePath(`/client/applications/${opts.applicationId}`)
  revalidatePath('/client')
  return { ok: true }
}
