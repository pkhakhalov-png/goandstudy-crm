'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/client-activity'

const BUCKET = 'client-docs'
const MAX_BYTES = 15 * 1024 * 1024

export type AppStage = 'created' | 'docs_collected' | 'fee_paid' | 'submitted' | 'decision'
export type AppDecision = 'offer' | 'conditional_offer' | 'rejected' | 'waitlisted' | 'withdrawn'
export type AppDocStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'optional'

const STAGE_LABELS: Record<AppStage, string> = {
  created: 'Заявка создана',
  docs_collected: 'Документы загружены',
  fee_paid: 'Application fee оплачен',
  submitted: 'Документы поданы в вуз',
  decision: 'Решение получено',
}

const DECISION_LABELS: Record<AppDecision, string> = {
  offer: 'Оффер',
  conditional_offer: 'Условный оффер',
  rejected: 'Отказ',
  waitlisted: 'Лист ожидания',
  withdrawn: 'Отозвано',
}

async function resolveContext(opts: { clientId?: number; applicationId?: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' as const }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const role = profile?.role ?? 'client'
  const admin = await createAdminClient()

  let clientId = opts.clientId
  if (opts.applicationId && !clientId) {
    const { data: app } = await admin
      .from('client_applications')
      .select('client_id')
      .eq('id', opts.applicationId)
      .maybeSingle()
    if (!app) return { error: 'Заявка не найдена' as const }
    clientId = app.client_id
  }

  let client: { id: number; curator_id: string | null } | null = null
  if (role === 'client') {
    const { data } = await admin.from('clients').select('id, curator_id').eq('email', user.email || '').maybeSingle()
    client = data
  } else if (clientId) {
    const { data } = await admin.from('clients').select('id, curator_id').eq('id', clientId).maybeSingle()
    client = data
  }
  if (!client) return { error: 'Клиент не найден' as const }
  return { user, admin, client, role, error: null as null }
}

function revalidateAll(clientId: number, applicationId?: string) {
  revalidatePath('/client', 'layout')
  revalidatePath(`/curator/clients/${clientId}`)
  revalidatePath('/curator/applications')
  if (applicationId) revalidatePath(`/client/applications/${applicationId}`)
}

export async function createApplication(opts: {
  clientId?: number
  shortlistId?: string | null
  universityName: string
  programName?: string | null
  country?: string | null
  intake?: string | null
  schoolId?: number | null
  appDeadline?: string | null
  feeAmount?: number | null
  feeCurrency?: string | null
}) {
  if (!opts.universityName?.trim()) return { error: 'Название вуза обязательно' }
  const ctx = await resolveContext({ clientId: opts.clientId })
  if (ctx.error) return { error: ctx.error }
  if (ctx.role === 'client') return { error: 'Только куратор может создавать заявки' }

  const { data, error } = await ctx.admin
    .from('client_applications')
    .insert({
      client_id: ctx.client.id,
      shortlist_id: opts.shortlistId || null,
      university_name: opts.universityName.trim(),
      program_name: opts.programName?.trim() || null,
      country: opts.country?.trim() || null,
      intake: opts.intake?.trim() || null,
      school_id: opts.schoolId || null,
      app_deadline: opts.appDeadline || null,
      fee_amount: opts.feeAmount ?? null,
      fee_currency: opts.feeCurrency?.trim() || null,
      stage: 'created',
      created_by: ctx.user.id,
    })
    .select('id')
    .single()
  if (error) return { error: `DB: ${error.message}` }

  await ctx.admin.from('application_events').insert({
    application_id: data.id,
    event_type: 'stage_change',
    content: STAGE_LABELS.created,
    payload: { to_stage: 'created' },
    author_id: ctx.user.id,
  })

  await logActivity(ctx.admin, {
    clientId: ctx.client.id,
    userId: ctx.user.id,
    type: 'application_created',
    content: `Куратор создал заявку: ${opts.universityName}${opts.programName ? ` — ${opts.programName}` : ''}`,
    metadata: { application_id: data.id, university_name: opts.universityName, program_name: opts.programName },
  })

  revalidateAll(ctx.client.id, data.id)
  return { success: true as const, id: data.id }
}

export async function updateApplicationStage(opts: { applicationId: string; stage: AppStage; clientId?: number }) {
  const ctx = await resolveContext({ applicationId: opts.applicationId, clientId: opts.clientId })
  if (ctx.error) return { error: ctx.error }
  if (ctx.role === 'client') return { error: 'Только куратор управляет стадиями' }

  const { data: prev } = await ctx.admin
    .from('client_applications')
    .select('stage')
    .eq('id', opts.applicationId)
    .single()

  const patch: Record<string, unknown> = { stage: opts.stage, updated_at: new Date().toISOString() }
  if (opts.stage === 'submitted') patch.submitted_at = new Date().toISOString()
  if (opts.stage === 'fee_paid') patch.fee_paid_at = new Date().toISOString()

  const { error } = await ctx.admin
    .from('client_applications')
    .update(patch)
    .eq('id', opts.applicationId)
    .eq('client_id', ctx.client.id)
  if (error) return { error: `DB: ${error.message}` }

  await ctx.admin.from('application_events').insert({
    application_id: opts.applicationId,
    event_type: 'stage_change',
    content: STAGE_LABELS[opts.stage],
    payload: { from_stage: prev?.stage, to_stage: opts.stage },
    author_id: ctx.user.id,
  })

  // Заявку с её именем для лога
  const { data: app } = await ctx.admin
    .from('client_applications')
    .select('university_name')
    .eq('id', opts.applicationId)
    .maybeSingle()
  await logActivity(ctx.admin, {
    clientId: ctx.client.id,
    userId: ctx.user.id,
    type: 'application_stage_change',
    content: `Заявка${app?.university_name ? ` (${app.university_name})` : ''}: ${STAGE_LABELS[opts.stage]}`,
    metadata: { application_id: opts.applicationId, stage: opts.stage },
  })

  revalidateAll(ctx.client.id, opts.applicationId)
  return { success: true as const }
}

export async function setApplicationDecision(opts: {
  applicationId: string
  decision: AppDecision
  clientId?: number
  notes?: string
}) {
  const ctx = await resolveContext({ applicationId: opts.applicationId, clientId: opts.clientId })
  if (ctx.error) return { error: ctx.error }
  if (ctx.role === 'client') return { error: 'Только куратор фиксирует решение' }

  const { error } = await ctx.admin
    .from('client_applications')
    .update({
      stage: 'decision',
      decision: opts.decision,
      decision_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', opts.applicationId)
    .eq('client_id', ctx.client.id)
  if (error) return { error: `DB: ${error.message}` }

  await ctx.admin.from('application_events').insert({
    application_id: opts.applicationId,
    event_type: 'decision_set',
    content: opts.notes ? `${DECISION_LABELS[opts.decision]} — ${opts.notes}` : DECISION_LABELS[opts.decision],
    payload: { decision: opts.decision },
    author_id: ctx.user.id,
  })

  const { data: app2 } = await ctx.admin
    .from('client_applications')
    .select('university_name')
    .eq('id', opts.applicationId)
    .maybeSingle()
  await logActivity(ctx.admin, {
    clientId: ctx.client.id,
    userId: ctx.user.id,
    type: 'application_decision',
    content: `Решение по заявке${app2?.university_name ? ` (${app2.university_name})` : ''}: ${DECISION_LABELS[opts.decision]}`,
    metadata: { application_id: opts.applicationId, decision: opts.decision },
  })

  revalidateAll(ctx.client.id, opts.applicationId)
  return { success: true as const }
}

export async function addApplicationNote(opts: {
  applicationId: string
  content: string
  clientId?: number
  isSchoolMessage?: boolean
}) {
  const text = opts.content?.trim()
  if (!text) return { error: 'Пустая заметка' }
  const ctx = await resolveContext({ applicationId: opts.applicationId, clientId: opts.clientId })
  if (ctx.error) return { error: ctx.error }

  const { error } = await ctx.admin.from('application_events').insert({
    application_id: opts.applicationId,
    event_type: opts.isSchoolMessage ? 'school_message' : 'note',
    content: text,
    author_id: ctx.user.id,
  })
  if (error) return { error: `DB: ${error.message}` }

  revalidateAll(ctx.client.id, opts.applicationId)
  return { success: true as const }
}

export async function deleteApplication(opts: { applicationId: string; clientId?: number }) {
  const ctx = await resolveContext({ applicationId: opts.applicationId, clientId: opts.clientId })
  if (ctx.error) return { error: ctx.error }
  if (ctx.role === 'client') return { error: 'Только куратор удаляет заявки' }

  // Удаляем все приложенные файлы из стораджа
  const { data: docs } = await ctx.admin
    .from('application_documents')
    .select('storage_path')
    .eq('application_id', opts.applicationId)
  const paths = (docs || []).map(d => d.storage_path).filter(Boolean) as string[]
  if (paths.length) await ctx.admin.storage.from(BUCKET).remove(paths)

  const { error } = await ctx.admin
    .from('client_applications')
    .delete()
    .eq('id', opts.applicationId)
    .eq('client_id', ctx.client.id)
  if (error) return { error: `DB: ${error.message}` }

  revalidateAll(ctx.client.id)
  return { success: true as const }
}

export async function addApplicationDocument(opts: {
  applicationId: string
  docType: string
  title?: string
  required?: boolean
  globalDocId?: string | null
  dueDate?: string | null
  clientId?: number
}) {
  const ctx = await resolveContext({ applicationId: opts.applicationId, clientId: opts.clientId })
  if (ctx.error) return { error: ctx.error }
  if (ctx.role === 'client') return { error: 'Только куратор формирует чек-лист' }

  const { error } = await ctx.admin.from('application_documents').insert({
    application_id: opts.applicationId,
    doc_type: opts.docType.trim(),
    title: opts.title?.trim() || null,
    required: opts.required ?? true,
    global_doc_id: opts.globalDocId || null,
    due_date: opts.dueDate || null,
    status: 'pending',
  })
  if (error) return { error: `DB: ${error.message}` }
  revalidateAll(ctx.client.id, opts.applicationId)
  return { success: true as const }
}

export async function updateApplicationDocumentStatus(opts: {
  documentId: string
  status: AppDocStatus
  applicationId: string
  notes?: string
  clientId?: number
}) {
  const ctx = await resolveContext({ applicationId: opts.applicationId, clientId: opts.clientId })
  if (ctx.error) return { error: ctx.error }
  if (ctx.role === 'client') return { error: 'Только куратор меняет статус документа' }

  const { error } = await ctx.admin
    .from('application_documents')
    .update({ status: opts.status, notes: opts.notes ?? null, updated_at: new Date().toISOString() })
    .eq('id', opts.documentId)
    .eq('application_id', opts.applicationId)
  if (error) return { error: `DB: ${error.message}` }
  revalidateAll(ctx.client.id, opts.applicationId)
  return { success: true as const }
}

export async function uploadApplicationDocument(formData: FormData) {
  const applicationId = String(formData.get('application_id') || '').trim()
  const docType = String(formData.get('doc_type') || '').trim()
  const title = String(formData.get('title') || '').trim() || null
  const docIdRaw = String(formData.get('document_id') || '').trim() || null
  const file = formData.get('file') as File | null
  const clientIdRaw = formData.get('client_id')
  const clientId = clientIdRaw ? Number(clientIdRaw) : undefined

  if (!applicationId) return { error: 'Не передан application_id' }
  if (!docType && !docIdRaw) return { error: 'Не передан doc_type' }
  if (!file || !(file instanceof File)) return { error: 'Файл не передан' }
  if (file.size === 0) return { error: 'Пустой файл' }
  if (file.size > MAX_BYTES) return { error: `Файл больше ${Math.round(MAX_BYTES / 1024 / 1024)} МБ` }

  const ctx = await resolveContext({ applicationId, clientId })
  if (ctx.error) return { error: ctx.error }

  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
  const safeDocType = docType.replace(/[^a-z0-9_-]/gi, '_') || 'doc'
  const storagePath = `clients/${ctx.client.id}/applications/${applicationId}/${safeDocType}/${Date.now()}-${crypto.randomUUID()}.${ext}`

  const buf = await file.arrayBuffer()
  const { error: upErr } = await ctx.admin.storage.from(BUCKET).upload(storagePath, buf, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (upErr) return { error: `Storage: ${upErr.message}` }

  let savedDocId: string | null = null
  if (docIdRaw) {
    // Заменяем существующую запись
    const { data: existing } = await ctx.admin
      .from('application_documents')
      .select('storage_path')
      .eq('id', docIdRaw)
      .single()
    if (existing?.storage_path) await ctx.admin.storage.from(BUCKET).remove([existing.storage_path])

    const { error } = await ctx.admin
      .from('application_documents')
      .update({
        storage_path: storagePath,
        file_name: file.name,
        file_size_bytes: file.size,
        mime_type: file.type || null,
        status: 'in_review',
        uploaded_by: ctx.user.id,
        uploaded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', docIdRaw)
    if (error) {
      await ctx.admin.storage.from(BUCKET).remove([storagePath])
      return { error: `DB: ${error.message}` }
    }
    savedDocId = docIdRaw
  } else {
    const { data: created, error } = await ctx.admin.from('application_documents').insert({
      application_id: applicationId,
      doc_type: docType,
      title,
      required: false,
      status: 'in_review',
      storage_path: storagePath,
      file_name: file.name,
      file_size_bytes: file.size,
      mime_type: file.type || null,
      uploaded_by: ctx.user.id,
      uploaded_at: new Date().toISOString(),
    }).select('id').single()
    if (error) {
      await ctx.admin.storage.from(BUCKET).remove([storagePath])
      return { error: `DB: ${error.message}` }
    }
    savedDocId = created?.id ?? null
  }

  await ctx.admin.from('application_events').insert({
    application_id: applicationId,
    event_type: 'doc_uploaded',
    content: title || docType,
    payload: { document_id: savedDocId, file_name: file.name, file_size_bytes: file.size },
    author_id: ctx.user.id,
  })

  revalidateAll(ctx.client.id, applicationId)
  return { success: true as const }
}

export async function getApplicationDocumentDownloadUrl(opts: { documentId: string; applicationId: string; clientId?: number }) {
  const ctx = await resolveContext({ applicationId: opts.applicationId, clientId: opts.clientId })
  if (ctx.error) return { error: ctx.error }

  const { data: doc } = await ctx.admin
    .from('application_documents')
    .select('storage_path, file_name, global_doc_id')
    .eq('id', opts.documentId)
    .eq('application_id', opts.applicationId)
    .maybeSingle()
  if (!doc) return { error: 'Документ не найден' }

  // Если переиспользуется глобальный — берём оттуда
  let storagePath = doc.storage_path
  let fileName = doc.file_name
  if (!storagePath && doc.global_doc_id) {
    const { data: gdoc } = await ctx.admin
      .from('client_documents')
      .select('storage_path, file_name')
      .eq('id', doc.global_doc_id)
      .maybeSingle()
    storagePath = gdoc?.storage_path ?? null
    fileName = gdoc?.file_name ?? null
  }
  if (!storagePath) return { error: 'Файл не загружен' }

  const { data, error } = await ctx.admin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60, { download: fileName || undefined })
  if (error || !data) return { error: error?.message || 'Не удалось создать ссылку' }
  return { url: data.signedUrl }
}

export async function deleteApplicationDocument(opts: { documentId: string; applicationId: string; clientId?: number }) {
  const ctx = await resolveContext({ applicationId: opts.applicationId, clientId: opts.clientId })
  if (ctx.error) return { error: ctx.error }
  if (ctx.role === 'client') return { error: 'Только куратор удаляет документы' }

  const { data: doc } = await ctx.admin
    .from('application_documents')
    .select('storage_path')
    .eq('id', opts.documentId)
    .eq('application_id', opts.applicationId)
    .maybeSingle()
  if (doc?.storage_path) await ctx.admin.storage.from(BUCKET).remove([doc.storage_path])

  const { error } = await ctx.admin
    .from('application_documents')
    .delete()
    .eq('id', opts.documentId)
    .eq('application_id', opts.applicationId)
  if (error) return { error: `DB: ${error.message}` }

  revalidateAll(ctx.client.id, opts.applicationId)
  return { success: true as const }
}
