'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function uploadDealFile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const dealId = formData.get('deal_id') as string
  const file = formData.get('file') as File

  if (!file || !dealId) return { error: 'Файл не выбран' }
  if (file.size > 10 * 1024 * 1024) return { error: 'Файл слишком большой (макс. 10 МБ)' }

  const admin = await createAdminClient()

  // Upload to Supabase Storage
  const ext = file.name.split('.').pop() || 'bin'
  const path = `deals/${dealId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`

  const { error: uploadErr } = await admin.storage
    .from('deal-files')
    .upload(path, file, { contentType: file.type })

  if (uploadErr) return { error: `Ошибка загрузки: ${uploadErr.message}` }

  // Get public URL
  const { data: urlData } = admin.storage.from('deal-files').getPublicUrl(path)

  // Save to DB
  const { error: dbErr } = await admin.from('deal_files').insert({
    deal_id: dealId,
    name: file.name,
    url: urlData.publicUrl,
    size: file.size,
    mime_type: file.type,
    source: 'upload',
    uploaded_by: user.id,
  })

  if (dbErr) return { error: dbErr.message }

  // Log activity
  await admin.from('deal_activities').insert({
    deal_id: dealId,
    user_id: user.id,
    activity_type: 'file_upload',
    content: `Загружен файл: ${file.name}`,
  })

  await admin.from('deals').update({ updated_at: new Date().toISOString() }).eq('id', dealId)

  revalidatePath(`/admin/funnel/${dealId}`)
  return { success: true }
}

export async function deleteDealFile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' }

  const fileId = formData.get('file_id') as string
  const dealId = formData.get('deal_id') as string

  const admin = await createAdminClient()

  // Get file info
  const { data: file } = await admin.from('deal_files').select('url, name').eq('id', fileId).single()
  if (!file) return { error: 'Файл не найден' }

  // Delete from storage
  const path = file.url.split('/deal-files/')[1]
  if (path) {
    await admin.storage.from('deal-files').remove([path])
  }

  // Delete from DB
  await admin.from('deal_files').delete().eq('id', fileId)

  // Log
  await admin.from('deal_activities').insert({
    deal_id: dealId,
    user_id: user.id,
    activity_type: 'system',
    content: `Удалён файл: ${file.name}`,
  })

  revalidatePath(`/admin/funnel/${dealId}`)
  return { success: true }
}
