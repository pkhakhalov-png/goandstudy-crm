// НЕ server action: вызывается из server component page.tsx и из
// server action applyFromShortlist. В Next.js 16 server actions могут
// быть вызваны только через form action / fetch / startTransition,
// поэтому helper выносим отдельно.

import { createAdminClient } from '@/lib/supabase/server'

/**
 * Авто-привязка всех совпадающих глобальных документов клиента к заявке.
 * Идемпотентно — пропускает уже привязанные. Вызывается при загрузке
 * wizard'а и при создании заявки из подборки.
 */
export async function autoLinkGlobalDocs(applicationId: string): Promise<void> {
  const admin = await createAdminClient()

  const { data: app } = await admin
    .from('client_applications')
    .select('id, client_id, profile_id')
    .eq('id', applicationId)
    .maybeSingle()
  if (!app?.profile_id) return

  const { data: profile } = await admin
    .from('school_application_profiles')
    .select('documents_required')
    .eq('id', app.profile_id)
    .maybeSingle()
  const required = (profile?.documents_required as { key: string; label: string }[]) || []
  if (required.length === 0) return

  const keys = required.map(r => r.key)

  const [globalRes, appRes] = await Promise.all([
    admin.from('client_documents')
      .select('id, doc_type, file_name, file_size_bytes, mime_type, storage_path')
      .eq('client_id', app.client_id)
      .in('doc_type', keys)
      .not('storage_path', 'is', null),
    admin.from('application_documents')
      .select('doc_type')
      .eq('application_id', applicationId),
  ])

  const alreadyLinked = new Set((appRes.data || []).map(r => r.doc_type))

  const toInsert = (globalRes.data || [])
    .filter(g => !alreadyLinked.has(g.doc_type))
    .map(g => ({
      application_id: applicationId,
      doc_type: g.doc_type,
      title: required.find(r => r.key === g.doc_type)?.label || null,
      required: false,
      status: 'in_review' as const,
      global_doc_id: g.id,
      file_name: g.file_name,
      file_size_bytes: g.file_size_bytes,
      mime_type: g.mime_type,
      uploaded_at: new Date().toISOString(),
    }))

  if (toInsert.length > 0) {
    await admin.from('application_documents').insert(toInsert)
  }
}
