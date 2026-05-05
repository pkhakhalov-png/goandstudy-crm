'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/client-activity'

type EssayType = 'resume' | 'motivation'

async function getViewer() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован', userId: null, email: null, role: null }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  return { error: null, userId: user.id, email: user.email || '', role: profile?.role || null }
}

/** Resolve which client the viewer can act on. Clients: match by email. Curators: via ?clientId param. */
async function resolveClient(requestedClientId: number | null, email: string, role: string | null) {
  const admin = await createAdminClient()
  if (role === 'client' || !role) {
    const { data } = await admin.from('clients').select('id, curator_id').eq('email', email).maybeSingle()
    return data
  }
  if (requestedClientId) {
    const { data } = await admin.from('clients').select('id, curator_id').eq('id', requestedClientId).maybeSingle()
    return data
  }
  return null
}

/** Client-side: save current draft (while editing). Preserves submitted/approved state. */
export async function saveClientDraft(opts: { clientId?: number; type: EssayType; content: any }) {
  const v = await getViewer()
  if (v.error) return { error: v.error }
  const client = await resolveClient(opts.clientId || null, v.email || '', v.role)
  if (!client) return { error: 'Клиент не найден' }

  const admin = await createAdminClient()
  const { data: existing } = await admin
    .from('client_essays')
    .select('id, status')
    .eq('client_id', client.id)
    .eq('type', opts.type)
    .maybeSingle()

  // Client can save draft only if not yet approved by curator
  if (existing?.status === 'approved' && v.role === 'client') {
    return { error: 'Куратор уже утвердил — обратись к куратору для правок' }
  }

  const payload: any = {
    client_id: client.id,
    type: opts.type,
    content: opts.content,
    last_updated_at: new Date().toISOString(),
  }
  if (!existing) payload.status = 'draft'

  const { error } = existing
    ? await admin.from('client_essays').update(payload).eq('id', existing.id)
    : await admin.from('client_essays').insert(payload)

  if (error) return { error: error.message }
  revalidatePath('/client', 'layout')
  revalidatePath('/curator/clients', 'layout')
  return { success: true }
}

/** Client submits to curator. Status = 'sent'. */
export async function submitToCurator(opts: { type: EssayType; clientId?: number }) {
  const v = await getViewer()
  if (v.error) return { error: v.error }
  const client = await resolveClient(opts.clientId || null, v.email || '', v.role)
  if (!client) return { error: 'Клиент не найден' }

  const admin = await createAdminClient()
  const { data: existing } = await admin
    .from('client_essays')
    .select('id')
    .eq('client_id', client.id)
    .eq('type', opts.type)
    .maybeSingle()
  if (!existing) return { error: 'Сначала заполни черновик' }

  const { error } = await admin
    .from('client_essays')
    .update({ status: 'sent', submitted_at: new Date().toISOString() })
    .eq('id', existing.id)
  if (error) return { error: error.message }

  revalidatePath('/client', 'layout')
  revalidatePath('/curator/clients', 'layout')
  return { success: true }
}

/** Curator saves edits to curator_content. Status = 'editing'. */
export async function curatorSaveEdit(opts: { clientId: number; type: EssayType; curatorContent: any }) {
  const v = await getViewer()
  if (v.error) return { error: v.error }
  if (v.role !== 'curator' && v.role !== 'admin' && v.role !== 'rop') return { error: 'Нет доступа' }

  const admin = await createAdminClient()
  const { data: existing } = await admin
    .from('client_essays')
    .select('id, status')
    .eq('client_id', opts.clientId)
    .eq('type', opts.type)
    .maybeSingle()

  if (!existing) {
    // Curator can create the row even if client hasn't started
    const { error } = await admin.from('client_essays').insert({
      client_id: opts.clientId,
      type: opts.type,
      content: {},
      curator_content: opts.curatorContent,
      status: 'editing',
      last_updated_at: new Date().toISOString(),
    })
    if (error) return { error: error.message }
  } else {
    const { error } = await admin
      .from('client_essays')
      .update({
        curator_content: opts.curatorContent,
        status: existing.status === 'approved' ? 'approved' : 'editing',
        last_updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (error) return { error: error.message }
  }

  revalidatePath(`/curator/clients/${opts.clientId}`)
  revalidatePath('/client', 'layout')
  return { success: true }
}

/** Curator finalizes. Status = 'approved'. Client sees the curator-polished version. */
export async function approveEssay(opts: { clientId: number; type: EssayType }) {
  const v = await getViewer()
  if (v.error) return { error: v.error }
  if (v.role !== 'curator' && v.role !== 'admin' && v.role !== 'rop') return { error: 'Нет доступа' }

  const admin = await createAdminClient()
  const { error } = await admin
    .from('client_essays')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('client_id', opts.clientId)
    .eq('type', opts.type)
  if (error) return { error: error.message }

  await logActivity(admin, {
    clientId: opts.clientId,
    userId: v.userId,
    type: 'essay_approved',
    content: opts.type === 'resume' ? 'Куратор утвердил резюме' : 'Куратор утвердил мотивационное письмо',
    metadata: { essay_type: opts.type },
  })

  revalidatePath(`/curator/clients/${opts.clientId}`)
  revalidatePath('/client', 'layout')
  return { success: true }
}
