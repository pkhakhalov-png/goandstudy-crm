'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient, createClient as createSsrClient } from './supabase/server'
import type { RoadmapData, RoadmapStage, RoadmapItem } from './roadmap-types'
import { DEFAULT_ROADMAP_TEMPLATE } from './roadmap-types'
import { logActivity } from './client-activity'
import { randomUUID } from 'crypto'

type ActionResult = { ok: true } | { ok: false; error: string }
const CURATOR_ROLES = new Set(['curator', 'admin', 'rop'])

async function checkAccess(clientId: number) {
  const ssr = await createSsrClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) return { ok: false as const, error: 'Не авторизован' }

  const admin = await createAdminClient()
  const { data: profile } = await admin.from('users').select('id, name, role').eq('id', user.id).single()
  const { data: client } = await admin.from('clients').select('id, email, curator_id').eq('id', clientId).maybeSingle()
  if (!client) return { ok: false as const, error: 'Клиент не найден' }

  const role = profile?.role
  const allowed =
    role === 'admin' || role === 'rop' ||
    (role === 'curator' && (await admin.from('curators').select('id').eq('user_id', user.id).maybeSingle()).data?.id === client.curator_id) ||
    (role === 'client' && client.email?.toLowerCase() === user.email?.toLowerCase())
  if (!allowed) return { ok: false as const, error: 'Нет доступа' }

  return { ok: true as const, admin, user, profile, role }
}

async function readRoadmap(clientId: number, admin: Awaited<ReturnType<typeof createAdminClient>>): Promise<RoadmapData> {
  const { data } = await admin.from('clients').select('roadmap_data').eq('id', clientId).single()
  const raw = data?.roadmap_data
  // Поддерживаем старый формат (массив items) → конвертируем в один безымянный stage
  if (Array.isArray(raw)) return { stages: [] }
  return (raw as RoadmapData) || { stages: [] }
}

async function writeRoadmap(clientId: number, data: RoadmapData, admin: Awaited<ReturnType<typeof createAdminClient>>) {
  return admin.from('clients').update({ roadmap_data: data }).eq('id', clientId)
}

function revalidate(clientId: number) {
  revalidatePath(`/curator/clients/${clientId}`)
  revalidatePath('/client')
}

/**
 * Засеивает шаблон. Тянет стадии из curator_stages + дефолтные пункты
 * из curator_stage_checklist — это держит дорожную карту в синхроне с
 * пайплайном куратора.
 * Идемпотентно — пропускает если стадии уже есть.
 */
export async function seedRoadmapTemplate(opts: { clientId: number }): Promise<ActionResult> {
  const ctx = await checkAccess(opts.clientId)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  if (!CURATOR_ROLES.has(ctx.role || '')) return { ok: false, error: 'Только куратор' }

  const data = await readRoadmap(opts.clientId, ctx.admin)
  if (data.stages.length > 0) return { ok: true }

  const [{ data: dbStages }, { data: dbChecklist }] = await Promise.all([
    ctx.admin.from('curator_stages').select('id, code, title').order('position'),
    ctx.admin.from('curator_stage_checklist').select('stage_id, text, position').order('position'),
  ])

  let stages: RoadmapStage[]
  if (dbStages && dbStages.length > 0) {
    const itemsByStage = new Map<string, { text: string; position: number }[]>()
    for (const c of (dbChecklist || [])) {
      const arr = itemsByStage.get(c.stage_id as string) || []
      arr.push({ text: c.text as string, position: (c.position as number) || 0 })
      itemsByStage.set(c.stage_id as string, arr)
    }
    stages = dbStages.map(s => ({
      id: randomUUID(),
      title: s.title as string,
      items: (itemsByStage.get(s.id as string) || [])
        .sort((a, b) => a.position - b.position)
        .map(it => ({ id: randomUUID(), title: it.text })),
    }))
  } else {
    // Fallback — хардкод-шаблон, если curator_stages пустой
    stages = DEFAULT_ROADMAP_TEMPLATE.map(t => ({
      id: randomUUID(),
      title: t.title,
      items: t.items.map(it => ({ id: randomUUID(), title: it.title })),
    }))
  }

  const { error } = await writeRoadmap(opts.clientId, { stages }, ctx.admin)
  if (error) return { ok: false, error: error.message }
  revalidate(opts.clientId)
  return { ok: true }
}

// ─── STAGES ────────────────────────────────────────────────────────────────

export async function addRoadmapStage(opts: { clientId: number; title: string }): Promise<ActionResult> {
  const ctx = await checkAccess(opts.clientId)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  if (!CURATOR_ROLES.has(ctx.role || '')) return { ok: false, error: 'Только куратор' }

  const data = await readRoadmap(opts.clientId, ctx.admin)
  data.stages.push({ id: randomUUID(), title: opts.title.trim(), items: [] })
  const { error } = await writeRoadmap(opts.clientId, data, ctx.admin)
  if (error) return { ok: false, error: error.message }
  revalidate(opts.clientId)
  return { ok: true }
}

export async function updateRoadmapStage(opts: {
  clientId: number
  stageId: string
  patch: Partial<Pick<RoadmapStage, 'title' | 'month' | 'done'>>
}): Promise<ActionResult> {
  const ctx = await checkAccess(opts.clientId)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  if (!CURATOR_ROLES.has(ctx.role || '')) return { ok: false, error: 'Только куратор' }

  const data = await readRoadmap(opts.clientId, ctx.admin)
  data.stages = data.stages.map(s => s.id === opts.stageId
    ? {
        ...s,
        ...(opts.patch.title !== undefined ? { title: opts.patch.title.trim() } : {}),
        ...(opts.patch.month !== undefined ? { month: opts.patch.month?.trim() || undefined } : {}),
        ...(opts.patch.done !== undefined ? { done: opts.patch.done } : {}),
      }
    : s
  )
  const { error } = await writeRoadmap(opts.clientId, data, ctx.admin)
  if (error) return { ok: false, error: error.message }
  revalidate(opts.clientId)
  return { ok: true }
}

export async function deleteRoadmapStage(opts: { clientId: number; stageId: string }): Promise<ActionResult> {
  const ctx = await checkAccess(opts.clientId)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  if (!CURATOR_ROLES.has(ctx.role || '')) return { ok: false, error: 'Только куратор' }

  const data = await readRoadmap(opts.clientId, ctx.admin)
  data.stages = data.stages.filter(s => s.id !== opts.stageId)
  const { error } = await writeRoadmap(opts.clientId, data, ctx.admin)
  if (error) return { ok: false, error: error.message }
  revalidate(opts.clientId)
  return { ok: true }
}

// ─── ITEMS ─────────────────────────────────────────────────────────────────

export async function addRoadmapItem(opts: {
  clientId: number
  stageId: string
  title: string
  month?: string
  comment?: string
}): Promise<ActionResult> {
  const ctx = await checkAccess(opts.clientId)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  if (!CURATOR_ROLES.has(ctx.role || '')) return { ok: false, error: 'Только куратор' }

  const data = await readRoadmap(opts.clientId, ctx.admin)
  data.stages = data.stages.map(s => s.id === opts.stageId
    ? { ...s, items: [...s.items, {
        id: randomUUID(),
        title: opts.title.trim(),
        month: opts.month?.trim() || undefined,
        comment: opts.comment?.trim() || undefined,
        done: false,
      }] }
    : s
  )
  const { error } = await writeRoadmap(opts.clientId, data, ctx.admin)
  if (error) return { ok: false, error: error.message }
  revalidate(opts.clientId)
  return { ok: true }
}

export async function updateRoadmapItem(opts: {
  clientId: number
  stageId: string
  itemId: string
  patch: Partial<Pick<RoadmapItem, 'title' | 'month' | 'comment' | 'done'>>
}): Promise<ActionResult> {
  const ctx = await checkAccess(opts.clientId)
  if (!ctx.ok) return { ok: false, error: ctx.error }

  // Клиент не может править структуру, но галочку done — не его задача (куратор).
  // Все поля только для куратора.
  if (!CURATOR_ROLES.has(ctx.role || '')) return { ok: false, error: 'Только куратор' }

  const data = await readRoadmap(opts.clientId, ctx.admin)
  data.stages = data.stages.map(s => s.id !== opts.stageId
    ? s
    : { ...s, items: s.items.map(i => i.id === opts.itemId ? { ...i, ...opts.patch } : i) }
  )
  const { error } = await writeRoadmap(opts.clientId, data, ctx.admin)
  if (error) return { ok: false, error: error.message }
  revalidate(opts.clientId)
  return { ok: true }
}

export async function deleteRoadmapItem(opts: {
  clientId: number
  stageId: string
  itemId: string
}): Promise<ActionResult> {
  const ctx = await checkAccess(opts.clientId)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  if (!CURATOR_ROLES.has(ctx.role || '')) return { ok: false, error: 'Только куратор' }

  const data = await readRoadmap(opts.clientId, ctx.admin)
  data.stages = data.stages.map(s => s.id !== opts.stageId
    ? s
    : { ...s, items: s.items.filter(i => i.id !== opts.itemId) }
  )
  const { error } = await writeRoadmap(opts.clientId, data, ctx.admin)
  if (error) return { ok: false, error: error.message }
  revalidate(opts.clientId)
  return { ok: true }
}

// ─── APPROVAL ──────────────────────────────────────────────────────────────

export async function approveRoadmap(opts: { clientId: number }): Promise<ActionResult> {
  const ctx = await checkAccess(opts.clientId)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  if (!CURATOR_ROLES.has(ctx.role || '')) return { ok: false, error: 'Только куратор' }

  const data = await readRoadmap(opts.clientId, ctx.admin)
  if (data.stages.length === 0) return { ok: false, error: 'Сначала добавь хотя бы один этап' }

  const { error } = await ctx.admin.from('clients').update({
    roadmap_approved_at: new Date().toISOString(),
    roadmap_approved_by_name: ctx.profile?.name || ctx.user.email || null,
  }).eq('id', opts.clientId)
  if (error) return { ok: false, error: error.message }
  await logActivity(ctx.admin, {
    clientId: opts.clientId,
    userId: ctx.user.id,
    type: 'roadmap_approved',
    content: 'Куратор утвердил дорожную карту',
  })
  revalidate(opts.clientId)
  return { ok: true }
}

export async function unapproveRoadmap(opts: { clientId: number }): Promise<ActionResult> {
  const ctx = await checkAccess(opts.clientId)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  if (!CURATOR_ROLES.has(ctx.role || '')) return { ok: false, error: 'Только куратор' }

  const { error } = await ctx.admin.from('clients').update({
    roadmap_approved_at: null,
    roadmap_approved_by_name: null,
  }).eq('id', opts.clientId)
  if (error) return { ok: false, error: error.message }
  await logActivity(ctx.admin, {
    clientId: opts.clientId,
    userId: ctx.user.id,
    type: 'roadmap_unapproved',
    content: 'Куратор снял утверждение дорожной карты',
  })
  revalidate(opts.clientId)
  return { ok: true }
}
