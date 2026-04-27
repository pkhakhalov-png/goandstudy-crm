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
  if (!clientId || !scholarshipId) return { error: 'Не передан client_id или scholarship_id' }

  // Подтянуть свежие данные стипендии для денормализации
  const sb = createScholarshipsClient()
  const { data: scholarship, error: schErr } = await sb
    .from('scholarships_topuni')
    .select('scholarship_id, title, institution_title, amount_text, deadline')
    .eq('scholarship_id', scholarshipId)
    .maybeSingle()
  if (schErr || !scholarship) return { error: 'Стипендия не найдена в каталоге' }

  const { error } = await ctx.admin.from('client_scholarships').upsert(
    {
      client_id: clientId,
      scholarship_id: scholarship.scholarship_id,
      scholarship_title: scholarship.title,
      institution_title: scholarship.institution_title,
      amount_text: scholarship.amount_text,
      deadline: scholarship.deadline,
      added_by: ctx.curatorId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id,scholarship_id' },
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
