'use server'

/**
 * Серверные действия для редактирования куратором карточек вузов, программ
 * и стипендий. Правки хранятся в raw_data.curator_overrides — это sticky-слой,
 * который AI-fill не перезаписывает.
 *
 * Доступ: только curator / admin / rop.
 *
 * Где что хранится:
 *  - schools.raw_data.curator_overrides            (parser DB)
 *  - schools.raw_data.curator_extras.cover_photo_url (parser DB)
 *  - programs.raw_data.curator_overrides           (parser DB)
 *  - idp_scholarships.raw_data.curator_overrides   (scholarships DB)
 *  - scholarships_topuni.raw_data.curator_overrides (scholarships DB)
 *
 * Кто менял — сохраняем в raw_data.curator_overrides.__meta для бейджа «ред. куратором».
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createParserClient } from '@/lib/supabase/parser'
import { createScholarshipsClient } from '@/lib/supabase/scholarships'
import { createAdminClient } from '@/lib/supabase/server'

const STAFF_ROLES = new Set(['curator', 'admin', 'rop'])

async function checkStaff(): Promise<{ ok: true; userId: string; role: string; name: string } | { ok: false; error: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Не авторизован' }
  const { data: profile } = await sb.from('users').select('role, name').eq('id', user.id).single()
  if (!profile || !STAFF_ROLES.has(profile.role)) return { ok: false, error: 'Нет прав' }
  return { ok: true, userId: user.id, role: profile.role, name: profile.name || '' }
}

/* ───────────────────────────────────────────────────────────────────────
   Helpers
   ─────────────────────────────────────────────────────────────────────── */

type OverrideMeta = { by_name?: string; by_id?: string; at?: string }
type OverrideSet = Record<string, any> & { __meta?: Record<string, OverrideMeta> }

function mergeOverrides(existing: OverrideSet | null, patch: Record<string, any>, staff: { userId: string; name: string }): OverrideSet {
  const next: OverrideSet = { ...(existing || {}) }
  const meta: Record<string, OverrideMeta> = { ...(next.__meta || {}) }
  const now = new Date().toISOString()
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    if (v === null || v === '') {
      // null или пустая строка — удаление override
      delete next[k]
      delete meta[k]
    } else {
      next[k] = v
      meta[k] = { by_name: staff.name, by_id: staff.userId, at: now }
    }
  }
  next.__meta = meta
  return next
}

/* ───────────────────────────────────────────────────────────────────────
   SCHOOLS — текстовые правки
   ─────────────────────────────────────────────────────────────────────── */

export async function saveSchoolOverride(opts: { schoolId: number; patch: Record<string, any> }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await checkStaff()
  if (!auth.ok) return auth

  const parser = createParserClient()
  const { data: school } = await parser.from('schools').select('raw_data').eq('id', opts.schoolId).maybeSingle()
  if (!school) return { ok: false, error: 'Вуз не найден' }

  const rawData = (school.raw_data as any) || {}
  const overrides = mergeOverrides(rawData.curator_overrides || null, opts.patch, auth)
  rawData.curator_overrides = overrides

  const { error } = await parser.from('schools').update({ raw_data: rawData }).eq('id', opts.schoolId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/curator/universities/${opts.schoolId}`)
  return { ok: true }
}

/* ───────────────────────────────────────────────────────────────────────
   SCHOOLS — обложка
   ─────────────────────────────────────────────────────────────────────── */

/**
 * Подготавливает signed upload URL для обложки вуза. Файл клиент льёт прямо
 * в Storage (без прохода через сервер). После загрузки клиент дёргает
 * finalizeSchoolCover чтобы записать URL в raw_data.curator_extras.cover_photo_url.
 */
export async function prepareSchoolCoverUpload(opts: { schoolId: number; ext: string }): Promise<{ ok: true; uploadUrl: string; storagePath: string; token: string } | { ok: false; error: string }> {
  const auth = await checkStaff()
  if (!auth.ok) return auth

  const admin = await createAdminClient()
  const ts = Date.now()
  const cleanExt = (opts.ext || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg'
  const storagePath = `${opts.schoolId}/${ts}.${cleanExt}`

  // Bucket создаётся через миграцию (создадим в этом же коммите)
  const { data, error } = await admin.storage.from('school-covers').createSignedUploadUrl(storagePath)
  if (error || !data) return { ok: false, error: error?.message || 'не удалось создать URL' }

  return { ok: true, uploadUrl: data.signedUrl, storagePath, token: data.token }
}

export async function finalizeSchoolCover(opts: { schoolId: number; storagePath: string }): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const auth = await checkStaff()
  if (!auth.ok) return auth

  const admin = await createAdminClient()
  const { data: pub } = admin.storage.from('school-covers').getPublicUrl(opts.storagePath)
  if (!pub.publicUrl) return { ok: false, error: 'не удалось получить URL' }

  const parser = createParserClient()
  const { data: school } = await parser.from('schools').select('raw_data').eq('id', opts.schoolId).maybeSingle()
  if (!school) return { ok: false, error: 'Вуз не найден' }

  const rawData = (school.raw_data as any) || {}
  const extras = { ...(rawData.curator_extras || {}) }
  extras.cover_photo_url = pub.publicUrl
  extras.cover_photo_by = { by_name: auth.name, by_id: auth.userId, at: new Date().toISOString() }
  rawData.curator_extras = extras

  const { error } = await parser.from('schools').update({ raw_data: rawData }).eq('id', opts.schoolId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/curator/universities/${opts.schoolId}`)
  return { ok: true, url: pub.publicUrl }
}

export async function removeSchoolCover(opts: { schoolId: number }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await checkStaff()
  if (!auth.ok) return auth

  const parser = createParserClient()
  const { data: school } = await parser.from('schools').select('raw_data').eq('id', opts.schoolId).maybeSingle()
  if (!school) return { ok: false, error: 'Вуз не найден' }

  const rawData = (school.raw_data as any) || {}
  const extras = { ...(rawData.curator_extras || {}) }
  // Явно ставим null (а не delete) чтобы getCoverPhoto показывал пустоту,
  // а не возвращался к AI-фото из campus_photo_url.
  extras.cover_photo_url = null
  extras.cover_photo_by = { by_name: auth.name, by_id: auth.userId, at: new Date().toISOString(), removed: true }
  rawData.curator_extras = extras

  const { error } = await parser.from('schools').update({ raw_data: rawData }).eq('id', opts.schoolId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/curator/universities/${opts.schoolId}`)
  return { ok: true }
}

/* ───────────────────────────────────────────────────────────────────────
   PROGRAMS
   ─────────────────────────────────────────────────────────────────────── */

export async function saveProgramOverride(opts: { programId: number; patch: Record<string, any> }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await checkStaff()
  if (!auth.ok) return auth

  const parser = createParserClient()
  const { data: program } = await parser.from('programs').select('raw_data, school_id').eq('id', opts.programId).maybeSingle()
  if (!program) return { ok: false, error: 'Программа не найдена' }

  const rawData = (program.raw_data as any) || {}
  const overrides = mergeOverrides(rawData.curator_overrides || null, opts.patch, auth)
  rawData.curator_overrides = overrides

  const { error } = await parser.from('programs').update({ raw_data: rawData }).eq('id', opts.programId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/curator/programs/${opts.programId}`)
  if (program.school_id) revalidatePath(`/curator/universities/${program.school_id}`)
  return { ok: true }
}

/* ───────────────────────────────────────────────────────────────────────
   SCHOLARSHIPS
   ─────────────────────────────────────────────────────────────────────── */

export async function saveIdpScholarshipOverride(opts: { id: number; patch: Record<string, any> }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await checkStaff()
  if (!auth.ok) return auth

  const sch = createScholarshipsClient()
  const { data: row } = await sch.from('idp_scholarships').select('raw_data').eq('id', opts.id).maybeSingle()
  if (!row) return { ok: false, error: 'Стипендия не найдена' }

  const rawData = (row.raw_data as any) || {}
  const overrides = mergeOverrides(rawData.curator_overrides || null, opts.patch, auth)
  rawData.curator_overrides = overrides

  const { error } = await sch.from('idp_scholarships').update({ raw_data: rawData }).eq('id', opts.id)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/curator/scholarships/idp/${opts.id}`)
  return { ok: true }
}

export async function saveTopUniScholarshipOverride(opts: { scholarshipId: string; patch: Record<string, any> }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await checkStaff()
  if (!auth.ok) return auth

  const sch = createScholarshipsClient()
  const { data: row } = await sch.from('scholarships_topuni').select('raw_data').eq('scholarship_id', opts.scholarshipId).maybeSingle()
  if (!row) return { ok: false, error: 'Стипендия не найдена' }

  const rawData = (row.raw_data as any) || {}
  const overrides = mergeOverrides(rawData.curator_overrides || null, opts.patch, auth)
  rawData.curator_overrides = overrides

  const { error } = await sch.from('scholarships_topuni').update({ raw_data: rawData }).eq('scholarship_id', opts.scholarshipId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/curator/scholarships/${opts.scholarshipId}`)
  return { ok: true }
}
