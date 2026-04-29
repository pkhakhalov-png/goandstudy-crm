'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createScholarshipsClient } from '@/lib/supabase/scholarships'
import { revalidatePath } from 'next/cache'

async function getCuratorContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' as const }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') {
    return { error: 'Нет доступа' as const }
  }
  const admin = await createAdminClient()
  const { data: curator } = await admin.from('curators').select('id').eq('user_id', user.id).maybeSingle()
  return { admin, curatorId: curator?.id || null, error: null as null }
}

export async function addScholarshipToClient(formData: FormData) {
  const ctx = await getCuratorContext()
  if (ctx.error) return { error: ctx.error }
  const clientId = Number(formData.get('client_id'))
  const scholarshipId = Number(formData.get('scholarship_id'))
  const kind = String(formData.get('kind') || 'private') as 'private' | 'government' | 'idp'
  if (!clientId || !scholarshipId) return { error: 'Не передан client_id или scholarship_id' }
  if (kind !== 'private' && kind !== 'government' && kind !== 'idp') return { error: 'Неверный kind' }

  const sb = createScholarshipsClient()

  let title: string
  let institution: string | null
  let amount: string | null
  let deadline: string | null

  if (kind === 'government') {
    const { data: g, error } = await sb
      .from('government_scholarships')
      .select('id, name, country_name, provider, monthly_stipend, monthly_stipend_currency, application_deadline')
      .eq('id', scholarshipId)
      .maybeSingle()
    if (error || !g) return { error: 'Стипендия не найдена в каталоге' }
    title = g.name
    institution = g.provider || g.country_name || null
    amount = g.monthly_stipend
      ? `${g.monthly_stipend.toLocaleString('ru')} ${g.monthly_stipend_currency || ''}/мес`.trim()
      : null
    deadline = g.application_deadline
  } else if (kind === 'idp') {
    const { data: i, error } = await sb
      .from('idp_scholarships')
      .select('id, name, university_name, school_id, value_amount, value_currency, value_text, application_deadline, school:schools(name)')
      .eq('id', scholarshipId)
      .maybeSingle()
    if (error || !i) return { error: 'IDP-стипендия не найдена в каталоге' }
    title = i.name
    institution = (i as any).school?.name || i.university_name || null
    amount = i.value_amount
      ? `${Number(i.value_amount).toLocaleString('ru')} ${i.value_currency || ''}`.trim()
      : i.value_text
    deadline = i.application_deadline
  } else {
    const { data: p, error } = await sb
      .from('scholarships_topuni')
      .select('scholarship_id, title, institution_title, amount_text, deadline')
      .eq('scholarship_id', scholarshipId)
      .maybeSingle()
    if (error || !p) return { error: 'Стипендия не найдена в каталоге' }
    title = p.title
    institution = p.institution_title
    amount = p.amount_text
    deadline = p.deadline
  }

  const { error } = await ctx.admin.from('client_scholarships').upsert(
    {
      client_id: clientId,
      kind,
      scholarship_id: scholarshipId,
      scholarship_title: title,
      institution_title: institution,
      amount_text: amount,
      deadline,
      added_by: ctx.curatorId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id,kind,scholarship_id' },
  )
  if (error) return { error: error.message }

  revalidatePath(`/curator/clients/${clientId}`)
  revalidatePath('/client', 'layout')
  return { success: true as const }
}

export async function removeScholarshipFromClient(formData: FormData) {
  const ctx = await getCuratorContext()
  if (ctx.error) return { error: ctx.error }
  const id = String(formData.get('id'))
  if (!id) return { error: 'Не передан id' }

  const { data: row } = await ctx.admin.from('client_scholarships').select('client_id').eq('id', id).maybeSingle()
  const { error } = await ctx.admin.from('client_scholarships').delete().eq('id', id)
  if (error) return { error: error.message }

  if (row?.client_id) revalidatePath(`/curator/clients/${row.client_id}`)
  revalidatePath('/client', 'layout')
  return { success: true as const }
}

export async function updateScholarshipStatus(formData: FormData) {
  const ctx = await getCuratorContext()
  if (ctx.error) return { error: ctx.error }
  const id = String(formData.get('id'))
  const status = String(formData.get('status'))
  const allowed = ['planned', 'applying', 'submitted', 'awarded', 'rejected']
  if (!id || !allowed.includes(status)) return { error: 'Неверные параметры' }

  const { data: row } = await ctx.admin.from('client_scholarships').select('client_id').eq('id', id).maybeSingle()
  const { error } = await ctx.admin
    .from('client_scholarships')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }

  if (row?.client_id) revalidatePath(`/curator/clients/${row.client_id}`)
  return { success: true as const }
}
