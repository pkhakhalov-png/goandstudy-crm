'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const BUCKET = 'client-docs'
const MAX_BYTES = 15 * 1024 * 1024 // 15 MB

async function resolveContext(opts: { clientId?: number }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' as const }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const role = profile?.role
  const admin = await createAdminClient()

  let client: { id: number; curator_id: string | null } | null = null
  if (role === 'client' || !role) {
    const { data } = await admin.from('clients').select('id, curator_id').eq('email', user.email || '').maybeSingle()
    client = data
  } else if (opts.clientId) {
    const { data } = await admin.from('clients').select('id, curator_id').eq('id', opts.clientId).maybeSingle()
    client = data
  }
  if (!client) return { error: 'Клиент не найден' as const }
  return { user, admin, client, role: role ?? 'client', error: null as null }
}

export async function uploadDocument(formData: FormData) {
  const clientIdRaw = formData.get('client_id')
  const docType = String(formData.get('doc_type') || '').trim()
  const title = String(formData.get('title') || '').trim() || null
  const file = formData.get('file') as File | null
  const clientId = clientIdRaw ? Number(clientIdRaw) : undefined

  if (!docType) return { error: 'Не передан doc_type' }
  if (!file || !(file instanceof File)) return { error: 'Файл не передан' }
  if (file.size === 0) return { error: 'Пустой файл' }
  if (file.size > MAX_BYTES) return { error: `Файл больше ${Math.round(MAX_BYTES / 1024 / 1024)} МБ` }

  const ctx = await resolveContext({ clientId })
  if (ctx.error) return { error: ctx.error }

  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
  const storagePath = `clients/${ctx.client.id}/${docType}/${Date.now()}-${crypto.randomUUID()}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadErr } = await ctx.admin.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
  if (uploadErr) return { error: `Storage: ${uploadErr.message}` }

  // Заменяем существующую запись того же doc_type — у клиента может быть только один паспорт и т.д.
  // Для optional (custom) — каждый раз создаём новую.
  const isOptional = docType === 'optional'
  if (!isOptional) {
    const { data: existing } = await ctx.admin
      .from('client_documents')
      .select('id, storage_path')
      .eq('client_id', ctx.client.id)
      .eq('doc_type', docType)
      .maybeSingle()
    if (existing?.storage_path) {
      await ctx.admin.storage.from(BUCKET).remove([existing.storage_path])
    }
    if (existing) {
      const { error } = await ctx.admin
        .from('client_documents')
        .update({
          title: title || null,
          status: 'received',
          storage_path: storagePath,
          file_name: file.name,
          file_size_bytes: file.size,
          mime_type: file.type || null,
          uploaded_by: ctx.user.id,
          uploaded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (error) {
        await ctx.admin.storage.from(BUCKET).remove([storagePath])
        return { error: `DB: ${error.message}` }
      }
      revalidatePath('/client', 'layout')
      revalidatePath(`/curator/clients/${ctx.client.id}`)
      return { success: true as const }
    }
  }

  const { error: insertErr } = await ctx.admin.from('client_documents').insert({
    client_id: ctx.client.id,
    doc_type: docType,
    title: title || null,
    status: 'received',
    storage_path: storagePath,
    file_name: file.name,
    file_size_bytes: file.size,
    mime_type: file.type || null,
    uploaded_by: ctx.user.id,
    uploaded_at: new Date().toISOString(),
  })
  if (insertErr) {
    await ctx.admin.storage.from(BUCKET).remove([storagePath])
    return { error: `DB: ${insertErr.message}` }
  }

  revalidatePath('/client', 'layout')
  revalidatePath(`/curator/clients/${ctx.client.id}`)
  return { success: true as const }
}

export async function getDocumentDownloadUrl(opts: { id: string; clientId?: number }) {
  const ctx = await resolveContext({ clientId: opts.clientId })
  if (ctx.error) return { error: ctx.error }

  const { data: doc } = await ctx.admin
    .from('client_documents')
    .select('id, client_id, storage_path, file_name')
    .eq('id', opts.id)
    .maybeSingle()
  if (!doc) return { error: 'Документ не найден' }
  if (doc.client_id !== ctx.client.id) return { error: 'Нет доступа' }
  if (!doc.storage_path) return { error: 'Файл не загружен' }

  const { data, error } = await ctx.admin.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, 60 * 60, { download: doc.file_name || undefined })
  if (error || !data) return { error: error?.message || 'Не удалось создать ссылку' }
  return { url: data.signedUrl }
}

export async function deleteDocument(opts: { id: string; clientId?: number }) {
  const ctx = await resolveContext({ clientId: opts.clientId })
  if (ctx.error) return { error: ctx.error }

  const { data: doc } = await ctx.admin
    .from('client_documents')
    .select('id, client_id, storage_path')
    .eq('id', opts.id)
    .maybeSingle()
  if (!doc) return { error: 'Документ не найден' }
  if (doc.client_id !== ctx.client.id) return { error: 'Нет доступа' }

  if (doc.storage_path) {
    await ctx.admin.storage.from(BUCKET).remove([doc.storage_path])
  }
  const { error } = await ctx.admin.from('client_documents').delete().eq('id', doc.id)
  if (error) return { error: error.message }

  revalidatePath('/client', 'layout')
  revalidatePath(`/curator/clients/${ctx.client.id}`)
  return { success: true as const }
}
