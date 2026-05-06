'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient, createClient as createSsrClient } from './supabase/server'
import { logActivity } from './client-activity'

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
  if (role === 'admin' || role === 'rop') {
    // допуск без ограничений
  } else if (role === 'curator') {
    // куратор видит только своих
    const { data: cur } = await admin.from('curators').select('id').eq('user_id', user.id).maybeSingle()
    if (!cur || cur.id !== client.curator_id) return { ok: false as const, error: 'Не твой клиент' }
  } else if (role === 'client') {
    // клиент только свой профиль
    if (client.email?.toLowerCase() !== user.email?.toLowerCase()) {
      return { ok: false as const, error: 'Нет доступа к чужому клиенту' }
    }
  } else {
    return { ok: false as const, error: 'Нет роли с доступом' }
  }

  return { ok: true as const, admin, user, profile, client }
}

export async function saveProjectField(opts: {
  clientId: number
  key: string
  value: string
}): Promise<ActionResult> {
  const ctx = await checkAccess(opts.clientId)
  if (!ctx.ok) return { ok: false, error: ctx.error }

  // Подгружаем текущий JSONB и мерджим
  const { data: row } = await ctx.admin.from('clients').select('project_data').eq('id', opts.clientId).single()
  const current = (row?.project_data as Record<string, any>) || {}
  const updated = {
    ...current,
    [opts.key]: opts.value,
    updated_at: new Date().toISOString(),
    updated_by_name: ctx.profile?.name || ctx.user.email || null,
  }

  const { error } = await ctx.admin.from('clients')
    .update({ project_data: updated })
    .eq('id', opts.clientId)
  if (error) return { ok: false, error: error.message }

  // Не логируем каждое поле отдельно — слишком шумно. Только первое
  // заполнение поля (когда было пусто) → одна строка в фид.
  if (!current[opts.key] && opts.value) {
    await logActivity(ctx.admin, {
      clientId: opts.clientId,
      userId: ctx.user.id,
      type: 'project_field_filled',
      content: `Куратор заполнил «Проект студента» → ${PROJECT_FIELD_LABELS[opts.key] || opts.key}`,
      metadata: { field: opts.key },
    })
  }

  revalidatePath(`/curator/clients/${opts.clientId}`)
  revalidatePath('/client')
  return { ok: true }
}

const PROJECT_FIELD_LABELS: Record<string, string> = {
  level: 'Уровень',
  specialty: 'Специальность',
  location: 'Локация',
  budget: 'Бюджет',
  start_date: 'Начало учёбы',
  english: 'Английский',
  education: 'Образование',
  other: 'Иное',
  note: 'Заметка',
}

export async function saveProjectNote(opts: {
  clientId: number
  note: string
}): Promise<ActionResult> {
  return saveProjectField({ clientId: opts.clientId, key: 'note', value: opts.note })
}

/**
 * Клиент подтверждает «Проект студента» — фиксируем дату + имя.
 * Только клиент может ставить эту отметку (себе).
 */
export async function confirmProject(opts: {
  clientId: number
}): Promise<ActionResult> {
  const ctx = await checkAccess(opts.clientId)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  if (ctx.profile?.role !== 'client') {
    return { ok: false, error: 'Только клиент может подтвердить проект' }
  }

  const { data: row } = await ctx.admin.from('clients').select('project_data').eq('id', opts.clientId).single()
  const current = (row?.project_data as Record<string, any>) || {}
  const updated = {
    ...current,
    confirmed_at: new Date().toISOString(),
    confirmed_by_name: ctx.profile?.name || ctx.user.email || null,
  }

  const { error } = await ctx.admin.from('clients')
    .update({ project_data: updated })
    .eq('id', opts.clientId)
  if (error) return { ok: false, error: error.message }

  await logActivity(ctx.admin, {
    clientId: opts.clientId,
    userId: ctx.user.id,
    type: 'project_confirmed',
    content: 'Клиент подтвердил «Проект студента»',
  })

  revalidatePath(`/curator/clients/${opts.clientId}`)
  revalidatePath('/client')
  return { ok: true }
}

/** Куратор/админ снимает подтверждение если хочет переписать поля. */
export async function unconfirmProject(opts: {
  clientId: number
}): Promise<ActionResult> {
  const ctx = await checkAccess(opts.clientId)
  if (!ctx.ok) return { ok: false, error: ctx.error }

  const { data: row } = await ctx.admin.from('clients').select('project_data').eq('id', opts.clientId).single()
  const current = (row?.project_data as Record<string, any>) || {}
  const { confirmed_at: _, confirmed_by_name: __, ...rest } = current
  const updated = rest

  const { error } = await ctx.admin.from('clients')
    .update({ project_data: updated })
    .eq('id', opts.clientId)
  if (error) return { ok: false, error: error.message }

  await logActivity(ctx.admin, {
    clientId: opts.clientId,
    userId: ctx.user.id,
    type: 'project_unconfirmed',
    content: 'Снято подтверждение «Проекта студента» — открыт для правок',
  })

  revalidatePath(`/curator/clients/${opts.clientId}`)
  revalidatePath('/client')
  return { ok: true }
}
