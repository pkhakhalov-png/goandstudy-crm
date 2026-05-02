'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient, createClient as createSsrClient } from './supabase/server'
import type { RoadmapItemRow, RoadmapStageKey } from './roadmap-types'
import { randomUUID } from 'crypto'

const CURATOR_ROLES = new Set(['curator', 'admin', 'rop'])

type ActionResult = { ok: true } | { ok: false; error: string }

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

async function readRoadmap(clientId: number, admin: Awaited<ReturnType<typeof createAdminClient>>): Promise<RoadmapItemRow[]> {
  const { data } = await admin.from('clients').select('roadmap_data').eq('id', clientId).single()
  return ((data?.roadmap_data as RoadmapItemRow[]) || []).filter(Boolean)
}

async function writeRoadmap(clientId: number, items: RoadmapItemRow[], admin: Awaited<ReturnType<typeof createAdminClient>>) {
  return admin.from('clients').update({ roadmap_data: items }).eq('id', clientId)
}

export async function addRoadmapItem(opts: {
  clientId: number
  stage: RoadmapStageKey
  title: string
  month?: string
  comment?: string
}): Promise<ActionResult> {
  const ctx = await checkAccess(opts.clientId)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  if (!CURATOR_ROLES.has(ctx.role || '')) {
    return { ok: false, error: 'Добавлять пункты может только куратор' }
  }

  const items = await readRoadmap(opts.clientId, ctx.admin)
  items.push({
    id: randomUUID(),
    stage: opts.stage,
    title: opts.title.trim(),
    month: opts.month?.trim() || undefined,
    comment: opts.comment?.trim() || undefined,
    done: false,
  })

  const { error } = await writeRoadmap(opts.clientId, items, ctx.admin)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/curator/clients/${opts.clientId}`)
  revalidatePath('/client')
  return { ok: true }
}

export async function approveRoadmap(opts: { clientId: number }): Promise<ActionResult> {
  const ctx = await checkAccess(opts.clientId)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  if (!CURATOR_ROLES.has(ctx.role || '')) {
    return { ok: false, error: 'Утверждать может только куратор' }
  }

  const items = await readRoadmap(opts.clientId, ctx.admin)
  if (items.length === 0) {
    return { ok: false, error: 'Сначала добавь хотя бы один пункт' }
  }

  const { error } = await ctx.admin.from('clients').update({
    roadmap_approved_at: new Date().toISOString(),
    roadmap_approved_by_name: ctx.profile?.name || ctx.user.email || null,
  }).eq('id', opts.clientId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/curator/clients/${opts.clientId}`)
  revalidatePath('/client')
  return { ok: true }
}

export async function unapproveRoadmap(opts: { clientId: number }): Promise<ActionResult> {
  const ctx = await checkAccess(opts.clientId)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  if (!CURATOR_ROLES.has(ctx.role || '')) {
    return { ok: false, error: 'Только куратор' }
  }

  const { error } = await ctx.admin.from('clients').update({
    roadmap_approved_at: null,
    roadmap_approved_by_name: null,
  }).eq('id', opts.clientId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/curator/clients/${opts.clientId}`)
  revalidatePath('/client')
  return { ok: true }
}

export async function updateRoadmapItem(opts: {
  clientId: number
  itemId: string
  patch: Partial<Pick<RoadmapItemRow, 'title' | 'month' | 'stage' | 'done'>>
}): Promise<ActionResult> {
  const ctx = await checkAccess(opts.clientId)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  if (!CURATOR_ROLES.has(ctx.role || '')) {
    return { ok: false, error: 'Только куратор' }
  }

  const items = await readRoadmap(opts.clientId, ctx.admin)
  const updated = items.map(i => i.id === opts.itemId ? { ...i, ...opts.patch } : i)

  const { error } = await writeRoadmap(opts.clientId, updated, ctx.admin)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/curator/clients/${opts.clientId}`)
  revalidatePath('/client')
  return { ok: true }
}

export async function deleteRoadmapItem(opts: {
  clientId: number
  itemId: string
}): Promise<ActionResult> {
  const ctx = await checkAccess(opts.clientId)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  if (!CURATOR_ROLES.has(ctx.role || '')) {
    return { ok: false, error: 'Только куратор' }
  }

  const items = await readRoadmap(opts.clientId, ctx.admin)
  const filtered = items.filter(i => i.id !== opts.itemId)

  const { error } = await writeRoadmap(opts.clientId, filtered, ctx.admin)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/curator/clients/${opts.clientId}`)
  revalidatePath('/client')
  return { ok: true }
}
