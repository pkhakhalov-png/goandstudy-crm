import { createAdminClient } from '@/lib/supabase/server'
import { createParserClient } from '@/lib/supabase/parser'
import type {
  TimelineStage,
  University,
  RequiredDoc,
  DocStatus,
  RoadmapStage,
  RoadmapItem,
} from '@/app/client/mock-data'

const COUNTRY_FLAGS: Record<string, string> = {
  'Канада': '🇨🇦',
  'США': '🇺🇸',
  'Великобритания': '🇬🇧',
  'Нидерланды': '🇳🇱',
  'Германия': '🇩🇪',
  'Франция': '🇫🇷',
  'Швеция': '🇸🇪',
  'Финляндия': '🇫🇮',
  'Дания': '🇩🇰',
  'Италия': '🇮🇹',
  'Испания': '🇪🇸',
  'Швейцария': '🇨🇭',
  'Ирландия': '🇮🇪',
}

/** Finds the client record linked to the logged-in user (by email match). */
export async function getClientForUser(userEmail: string) {
  const admin = await createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('*')
    .eq('email', userEmail)
    .maybeSingle()
  return client
}

/**
 * Resolves which client the cabinet should show.
 * - Clients: match by their email
 * - Curators/admin/rop: explicit ?clientId=N in URL, otherwise their first client
 */
export async function resolveClientForViewer(opts: {
  userId: string
  userEmail: string
  role: string | undefined
  requestedClientId?: number
}) {
  const admin = await createAdminClient()

  if (opts.role === 'client' || !opts.role) {
    return getClientForUser(opts.userEmail)
  }

  // Privileged roles: explicit clientId wins
  if (opts.requestedClientId) {
    const { data } = await admin.from('clients').select('*').eq('id', opts.requestedClientId).maybeSingle()
    return data
  }

  // Curator: fallback to their first client
  if (opts.role === 'curator') {
    const { data: curatorRow } = await admin.from('curators').select('id').eq('user_id', opts.userId).maybeSingle()
    if (curatorRow?.id) {
      const { data } = await admin.from('clients').select('*').eq('curator_id', curatorRow.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      return data
    }
  }

  // Admin/rop with no clientId → just grab the most recent client as a demo target
  const { data } = await admin.from('clients').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data
}

type CuratorStageRow = {
  id: string
  code: string
  title: string
  subtitle: string | null
  position: number
}

type ChecklistRow = { id: string; stage_id: string; text: string; position: number; section: string | null }
type ChecklistProgressRow = { checklist_id: string; is_done: boolean; done_at: string | null }

/**
 * Reads the five macro-stages for the timeline hero.
 * Source of truth for "current" is `clients.current_stage_code`.
 * Progress on the current stage = % of that stage's checklist items done.
 */
export async function getClientTimeline(clientId: number): Promise<TimelineStage[]> {
  const admin = await createAdminClient()
  const [{ data: client }, { data: curatorStages }, { data: checklist }, { data: progress }] = await Promise.all([
    admin.from('clients').select('current_stage_code').eq('id', clientId).single(),
    admin.from('curator_stages').select('*').order('position'),
    admin.from('curator_stage_checklist').select('id, stage_id, text, position, section').order('position'),
    admin.from('client_checklist_progress').select('checklist_id, is_done, done_at').eq('client_id', clientId),
  ])

  const stages = (curatorStages || []) as CuratorStageRow[]
  const currentCode = client?.current_stage_code as string | null
  const currentIdx = stages.findIndex(s => s.code === currentCode)

  const doneByItem = new Map<string, boolean>()
  for (const p of (progress || []) as ChecklistProgressRow[]) {
    doneByItem.set(p.checklist_id, p.is_done)
  }

  const itemsByStage = new Map<string, ChecklistRow[]>()
  for (const item of (checklist || []) as ChecklistRow[]) {
    const bucket = itemsByStage.get(item.stage_id) || []
    bucket.push(item)
    itemsByStage.set(item.stage_id, bucket)
  }

  return stages.map((s, idx): TimelineStage => {
    const stageItems = itemsByStage.get(s.id) || []
    const doneCount = stageItems.filter(it => doneByItem.get(it.id)).length
    const total = stageItems.length
    const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0

    let state: 'done' | 'current' | 'upcoming'
    if (currentIdx === -1) {
      state = 'upcoming'
    } else if (idx < currentIdx) {
      state = 'done'
    } else if (idx === currentIdx) {
      state = 'current'
    } else {
      state = 'upcoming'
    }

    return {
      key: s.code,
      num: idx + 1,
      title: s.title,
      state,
      progress: state === 'current' ? pct : undefined,
    }
  })
}

/**
 * Returns the roadmap — full list of checklist items grouped by stage.
 * Mirrors curator's "Дорожная карта" tab exactly.
 */
export async function getClientRoadmap(clientId: number): Promise<RoadmapStage[]> {
  const admin = await createAdminClient()
  const [{ data: client }, { data: curatorStages }, { data: checklist }, { data: progress }] = await Promise.all([
    admin.from('clients').select('current_stage_code').eq('id', clientId).single(),
    admin.from('curator_stages').select('*').order('position'),
    admin.from('curator_stage_checklist').select('id, stage_id, text, position, section').order('position'),
    admin.from('client_checklist_progress').select('checklist_id, is_done, done_at').eq('client_id', clientId),
  ])

  const stages = (curatorStages || []) as CuratorStageRow[]
  const currentCode = client?.current_stage_code as string | null

  const progressMap = new Map<string, ChecklistProgressRow>()
  for (const p of (progress || []) as ChecklistProgressRow[]) {
    progressMap.set(p.checklist_id, p)
  }

  const itemsByStage = new Map<string, ChecklistRow[]>()
  for (const item of (checklist || []) as ChecklistRow[]) {
    const bucket = itemsByStage.get(item.stage_id) || []
    bucket.push(item)
    itemsByStage.set(item.stage_id, bucket)
  }

  return stages.map((s): RoadmapStage => {
    const stageItems = itemsByStage.get(s.id) || []
    const isCurrentStage = s.code === currentCode
    const firstUndoneIdx = stageItems.findIndex(it => !progressMap.get(it.id)?.is_done)
    return {
      stageKey: s.code,
      stageName: s.title,
      items: stageItems.map((it, idx): RoadmapItem => {
        const p = progressMap.get(it.id)
        const done = !!p?.is_done
        const isCurrent = isCurrentStage && !done && idx === firstUndoneIdx
        return {
          key: it.id,
          title: it.text,
          date: p?.done_at ? new Date(p.done_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—',
          done,
          current: isCurrent,
        }
      }),
    }
  })
}

type UniRow = {
  id: string
  university_name: string
  program_name: string | null
  country: string | null
  city: string | null
  tuition_per_year: number | null
  currency: string | null
  notes: string | null
  priority: number | null
}

function parseLink(notes: string | null): { school_id?: number; program_id?: number } {
  try { return JSON.parse(notes || '{}') } catch { return {} }
}

export async function getClientUniversities(clientId: number): Promise<University[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from('client_universities')
    .select('*')
    .eq('client_id', clientId)
    .order('priority', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  const rows = (data || []) as UniRow[]

  // Enrich with school logo + ids from parser DB (batch fetch)
  const schoolIds = Array.from(new Set(rows.map(r => parseLink(r.notes).school_id).filter((x): x is number => typeof x === 'number')))
  let logoBySchool = new Map<number, string | null>()
  if (schoolIds.length > 0) {
    try {
      const parser = createParserClient()
      const { data: schools } = await parser.from('schools').select('id, logo_url').in('id', schoolIds)
      for (const s of schools || []) logoBySchool.set(s.id as number, (s as any).logo_url)
    } catch { /* parser DB unavailable — fall back to flags */ }
  }

  return rows.map((u): University => {
    const link = parseLink(u.notes)
    return {
      key: u.id,
      name: u.university_name,
      city: u.city || '—',
      country: u.country || '—',
      flag: (u.country && COUNTRY_FLAGS[u.country]) || '🎓',
      logoUrl: link.school_id ? logoBySchool.get(link.school_id) || null : null,
      programId: link.program_id || null,
      schoolId: link.school_id || null,
      program: u.program_name || 'Программа уточняется',
      tuition: u.tuition_per_year && u.currency
        ? `${Math.round(u.tuition_per_year).toLocaleString('ru-RU')} ${u.currency} / год`
        : undefined,
      match: 85,
      reason: 'Комментарий куратора появится здесь',
      tags: [],
    }
  })
}

/** Returns list of university ids ordered by priority (1..N). */
export async function getClientPriorityKeys(clientId: number): Promise<string[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from('client_universities')
    .select('id, priority')
    .eq('client_id', clientId)
    .not('priority', 'is', null)
    .order('priority', { ascending: true })
  return (data || []).map(r => r.id)
}

type DocRow = {
  id: string
  doc_type: string
  title: string | null
  status: 'missing' | 'received' | 'translating' | 'translated' | 'notarized' | 'uploaded_to_uni'
  file_id: string | null
  notes: string | null
}

const DOC_STATUS_MAP: Record<DocRow['status'], DocStatus> = {
  missing: 'missing',
  received: 'uploaded',
  translating: 'pending',
  translated: 'pending',
  notarized: 'pending',
  uploaded_to_uni: 'uploaded',
}

// Поля «Проект студента» — экспортируется из отдельного файла без server-only кода
export { STUDENT_PROJECT_FIELDS } from './student-project-types'
export type { StudentProjectFieldKey, StudentProjectData } from './student-project-types'

import type { StudentProjectData } from './student-project-types'

export async function getClientProject(clientId: number): Promise<StudentProjectData> {
  const admin = await createAdminClient()
  const { data } = await admin.from('clients').select('project_data').eq('id', clientId).maybeSingle()
  return (data?.project_data as StudentProjectData) || {}
}

const LOCKED_DOC_TYPES = new Set(['cv', 'motivation_letter'])

export type EssayRow = {
  id: string
  client_id: number
  type: 'resume' | 'motivation'
  content: any
  curator_content: any | null
  ai_suggestions: any | null
  status: 'draft' | 'sent' | 'editing' | 'approved'
  submitted_at: string | null
  approved_at: string | null
  last_updated_at: string | null
}

export async function getClientEssays(clientId: number): Promise<EssayRow[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from('client_essays')
    .select('*')
    .eq('client_id', clientId)
    .then(r => r, () => ({ data: [] }))
  return (data as EssayRow[]) || []
}

export async function getClientEssay(clientId: number, type: 'resume' | 'motivation'): Promise<EssayRow | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from('client_essays')
    .select('*')
    .eq('client_id', clientId)
    .eq('type', type)
    .maybeSingle()
    .then(r => r, () => ({ data: null }))
  return (data as EssayRow) || null
}

export type ClientDocumentRow = {
  id: string
  doc_type: string
  title: string | null
  status: DocRow['status']
  file_name: string | null
  file_size_bytes: number | null
  mime_type: string | null
  storage_path: string | null
  uploaded_at: string | null
}

export async function getClientDocumentRows(clientId: number): Promise<ClientDocumentRow[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from('client_documents')
    .select('id, doc_type, title, status, file_name, file_size_bytes, mime_type, storage_path, uploaded_at')
    .eq('client_id', clientId)
    .order('uploaded_at', { ascending: false, nullsFirst: false })
    .then(r => r, () => ({ data: [] }))
  return (data as ClientDocumentRow[]) || []
}

export type AppStage = 'created' | 'docs_collected' | 'fee_paid' | 'submitted' | 'decision'
export type AppDecision = 'offer' | 'conditional_offer' | 'rejected' | 'waitlisted' | 'withdrawn'
export type AppDocStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'optional'

export type ApplicationRow = {
  id: string
  client_id: number
  shortlist_id: string | null
  profile_id: string | null
  university_name: string
  program_name: string | null
  country: string | null
  intake: string | null
  school_id: number | null
  stage: AppStage
  decision: AppDecision | null
  app_deadline: string | null
  submitted_at: string | null
  decision_at: string | null
  fee_amount: number | null
  fee_currency: string | null
  fee_paid_at: string | null
  school_app_ref: string | null
  hold_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type ProfileFieldDef = {
  key: string
  label: string
  type: 'text' | 'date' | 'number' | 'select' | 'phone' | 'textarea'
  required: boolean
  group?: string
  options?: string[]
  notes?: string
}

export type DocumentReqDef = {
  key: string
  label: string
  format?: string
  max_mb?: number
  language?: string
  required: boolean
  notes?: string
}

export type EssayReqDef = {
  key: string
  label: string
  prompt: string
  min_words?: number
  max_words?: number
  required: boolean
  notes?: string
}

export type ExternalStepDef = {
  key: string
  label: string
  url?: string
  required: boolean
  notes?: string
}

export type IntakeDef = {
  name: string
  deadline_intl?: string
  deadline_uae?: string
  start_date?: string
  status?: string
  notes?: string
}

export type SchoolApplicationProfileRow = {
  id: string
  school_id: number | null
  school_name: string
  country_code: string | null
  level: 'bachelor' | 'master' | 'phd'
  portal_url: string
  registration_url: string | null
  application_fee_amount: number | null
  application_fee_currency: string | null
  profile_fields_required: ProfileFieldDef[]
  documents_required: DocumentReqDef[]
  essays_required: EssayReqDef[]
  external_steps: ExternalStepDef[]
  intakes: IntakeDef[]
  is_active: boolean
}

export async function getApplicationProfile(profileId: string): Promise<SchoolApplicationProfileRow | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from('school_application_profiles')
    .select('*')
    .eq('id', profileId)
    .maybeSingle()
    .then(r => r, () => ({ data: null }))
  return (data as SchoolApplicationProfileRow) || null
}

export async function getApplicationProfileData(applicationId: string): Promise<Record<string, string>> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from('application_profile_data')
    .select('data')
    .eq('application_id', applicationId)
    .maybeSingle()
    .then(r => r, () => ({ data: null }))
  return (data?.data as Record<string, string>) || {}
}

export type ApplicationDocumentRow = {
  id: string
  application_id: string
  doc_type: string
  title: string | null
  required: boolean
  status: AppDocStatus
  global_doc_id: string | null
  storage_path: string | null
  file_name: string | null
  file_size_bytes: number | null
  mime_type: string | null
  due_date: string | null
  notes: string | null
  uploaded_at: string | null
  created_at: string
}

export type ApplicationEventRow = {
  id: string
  application_id: string
  event_type: 'stage_change' | 'note' | 'school_message' | 'doc_uploaded' | 'decision_set'
  content: string | null
  payload: any
  author_id: string | null
  created_at: string
}

export async function getClientApplications(clientId: number): Promise<ApplicationRow[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from('client_applications')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .then(r => r, () => ({ data: [] }))
  return (data as ApplicationRow[]) || []
}

export async function getApplication(applicationId: string): Promise<ApplicationRow | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from('client_applications')
    .select('*')
    .eq('id', applicationId)
    .maybeSingle()
    .then(r => r, () => ({ data: null }))
  return (data as ApplicationRow) || null
}

export async function getApplicationDocuments(applicationId: string): Promise<ApplicationDocumentRow[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from('application_documents')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true })
    .then(r => r, () => ({ data: [] }))
  return (data as ApplicationDocumentRow[]) || []
}

export async function getApplicationEvents(applicationId: string): Promise<ApplicationEventRow[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from('application_events')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })
    .then(r => r, () => ({ data: [] }))
  return (data as ApplicationEventRow[]) || []
}

/** Все заявки во все вузы — для канбана куратора, сгруппированных по university_name+school_id */
export async function getAllApplicationsForCurator(curatorId: string | null): Promise<(ApplicationRow & { client_name: string | null; client_email: string | null })[]> {
  const admin = await createAdminClient()
  let q = admin
    .from('client_applications')
    .select('*, clients!inner(id, name, email, curator_id)')
    .order('updated_at', { ascending: false })
  if (curatorId) q = q.eq('clients.curator_id', curatorId)
  const { data } = await q.then(r => r, () => ({ data: [] }))
  return ((data as any[]) || []).map(row => ({
    ...row,
    client_name: row.clients?.name ?? null,
    client_email: row.clients?.email ?? null,
  }))
}

export type UnlockedScholarshipRow = {
  id: string
  client_id: number
  kind: 'private' | 'government' | 'idp'
  scholarship_id: number
  scholarship_title: string
  institution_title: string | null
  amount_text: string | null
  deadline: string | null
  status: 'planned' | 'preparing' | 'applying' | 'submitted' | 'awarded' | 'rejected'
  notes: string | null
  unlocked_for_client: boolean
  created_at: string
  updated_at: string
}

/** Стипендии, которые куратор раскрыл клиенту. */
export async function getClientUnlockedScholarships(clientId: number): Promise<UnlockedScholarshipRow[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from('client_scholarships')
    .select('*')
    .eq('client_id', clientId)
    .eq('unlocked_for_client', true)
    .order('deadline', { ascending: true, nullsFirst: false })
    .then(r => r, () => ({ data: [] }))
  return (data as UnlockedScholarshipRow[]) || []
}

/** Есть ли у клиента хотя бы одна раскрытая стипендия (для показа таба в меню). */
export async function clientHasUnlockedScholarships(clientId: number): Promise<boolean> {
  const admin = await createAdminClient()
  const { count } = await admin
    .from('client_scholarships')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('unlocked_for_client', true)
    .then(r => r, () => ({ count: 0 }))
  return (count || 0) > 0
}

export async function getClientDocuments(clientId: number): Promise<RequiredDoc[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from('client_documents')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })

  return ((data || []) as DocRow[]).map((d): RequiredDoc => ({
    key: d.id,
    title: d.title || d.doc_type,
    hint: d.notes || undefined,
    status: LOCKED_DOC_TYPES.has(d.doc_type) ? 'locked' : DOC_STATUS_MAP[d.status],
    lockedHint: LOCKED_DOC_TYPES.has(d.doc_type)
      ? 'Создаётся через блок выше — загорится когда куратор подготовит финальную версию.'
      : undefined,
  }))
}
