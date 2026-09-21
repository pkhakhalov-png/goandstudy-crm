'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { площадка } from '@/lib/content/platforms'

/**
 * Действия раздела «Контент» (E4.11).
 *
 * Три правила, общие для всех:
 *
 *   1. Сессия и роль проверяются в каждом действии, а не только в оболочке.
 *      Оболочка защищает экран, а действие вызывается по адресу и экрана не
 *      требует.
 *   2. Изменения с последствиями наружу несут ключ повтора и предусловие по
 *      версии. Нажатие «запланировать» дважды подряд — обычное дело, если
 *      первый ответ не дошёл, и оно не должно ставить два поста.
 *   3. Каждое действие пишет в журнал, кто и что сделал. Особенно те, что
 *      останавливают: «почему у нас три дня ничего не выходило» — вопрос,
 *      который задают через три дня.
 */

type Result = { error: string } | { ok: true; note?: string }

async function admin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' as const, user: null }
  const { data: profile } = await supabase.from('users').select('role, name').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Только админ' as const, user: null }
  return { error: null, user: { id: user.id, name: profile?.name || user.email || user.id } }
}

async function journal(content: any, actor: string, operation: string, entityType: string, entityId: number | null, note?: string) {
  await content.from('audit_events').insert({
    actor, operation, entity_type: entityType, entity_id: entityId, new_hash: note ?? null,
  })
}

/* ── Каналы ─────────────────────────────────────────────────────────────── */

/**
 * Завести канал.
 *
 * Всегда приостановленным. Включение — отдельное решение: канал, который
 * начинает публиковать в момент создания, однажды опубликует раньше, чем его
 * успели настроить.
 */
export async function createChannel(input: {
  platform: string
  accountExternalId: string
  title: string
  timezone?: string
  dailyCap?: number
}): Promise<Result> {
  const { error: authErr, user } = await admin()
  if (authErr) return { error: authErr }

  const account = String(input.accountExternalId ?? '').trim()
  if (!account) return { error: 'Нужен идентификатор аккаунта на площадке' }

  // Площадка берётся из реестра, а не из списка в двух строках кода: способ
  // доставки — его же поле, и вывести его из названия нельзя. У VC сегодня
  // выкладка руками, а завтра появится токен, и это меняется в реестре, а не
  // здесь.
  const п = площадка(input.platform)
  if (!п) return { error: `Площадки «${input.platform}» нет в реестре` }
  if (п.доставка === 'ssh') return { error: 'Сайт публикуется агентом, каналом он не заводится' }

  const cap = Number(input.dailyCap ?? 1)
  if (!Number.isInteger(cap) || cap < 1 || cap > 10) {
    return { error: 'Темп от 1 до 10 постов в день. Больше — только после замера, так написано в плане' }
  }

  const content = (await createAdminClient()).schema('content' as any)
  const { data, error } = await content.from('channels').insert({
    platform: п.код,
    account_external_id: account,
    title: String(input.title ?? '').trim() || account,
    timezone: input.timezone || 'Europe/Moscow',
    mode: 'paused',
    delivery: п.доставка,
    daily_cap: cap,
  }).select('id').single()

  if (error) {
    return { error: /duplicate|unique/i.test(error.message) ? 'Такой канал уже заведён' : error.message }
  }
  await journal(content, user!.name, 'create_channel', 'channel', (data as any).id, `${п.код}/${account}`)
  revalidatePath('/admin/content/channels')
  revalidatePath('/admin/content/connections')
  return {
    ok: true,
    note: п.доставка === 'manual'
      ? 'Канал заведён приостановленным. Выкладка здесь ручная: машина готовит, публикует человек.'
      : 'Канал заведён приостановленным. Включить — отдельной кнопкой.',
  }
}

/** Включить или приостановить канал. */
export async function setChannelMode(channelId: number, mode: 'active' | 'paused' | 'stopped'): Promise<Result> {
  const { error: authErr, user } = await admin()
  if (authErr) return { error: authErr }
  if (!['active', 'paused', 'stopped'].includes(mode)) return { error: 'Неизвестный режим' }

  const content = (await createAdminClient()).schema('content' as any)
  const { data: before } = await content.from('channels').select('mode, title, account_external_id').eq('id', channelId).single()
  if (!before) return { error: 'Канала нет' }
  if ((before as any).mode === mode) return { ok: true, note: 'Режим уже такой — ничего не изменилось' }

  const { error } = await content.from('channels').update({ mode }).eq('id', channelId)
  if (error) return { error: error.message }

  await journal(content, user!.name, 'set_channel_mode', 'channel', channelId, `${(before as any).mode} → ${mode}`)
  revalidatePath('/admin/content/channels')
  revalidatePath('/admin/content')

  return {
    ok: true,
    note: mode === 'active'
      ? 'Канал включён. Запланированные посты пойдут по расписанию.'
      : 'Новые публикации на этот канал не ставятся. Уже запланированные остаются в плане.',
  }
}

/**
 * Остановить все новые публикации.
 *
 * Рубильник. Нужен в тот момент, когда стало понятно, что выходит неправильное,
 * а разбираться некогда. Поэтому он один и делает ровно одно: переводит все
 * каналы в stopped.
 *
 * Запланированное при этом НЕ снимается. Снять — другое решение, у него другие
 * последствия, и принимать его в панике не надо. Рубильник останавливает
 * поток, а не стирает план.
 */
export async function stopAllPublishing(reason: string): Promise<Result> {
  const { error: authErr, user } = await admin()
  if (authErr) return { error: authErr }
  if (!reason || reason.trim().length < 5) {
    return { error: 'Нужна причина: её прочитают, когда будут разбираться, почему ничего не выходило' }
  }

  const content = (await createAdminClient()).schema('content' as any)
  const { data: affected } = await content.from('channels').select('id').neq('mode', 'stopped')
  const ids = ((affected ?? []) as any[]).map((c) => c.id)
  if (!ids.length) return { ok: true, note: 'Все каналы и так остановлены' }

  const { error } = await content.from('channels').update({ mode: 'stopped' }).in('id', ids)
  if (error) return { error: error.message }

  await journal(content, user!.name, 'stop_all_publishing', 'channel', null, `${ids.length} каналов: ${reason.trim()}`)
  await content.from('attention_items').insert({
    reason_code: 'publishing_stopped', severity: 'high', entity_type: 'channel', entity_id: null,
    owner: user!.name,
    suggested_action: `Выпуск остановлен целиком: ${reason.trim()}. Решить, когда включать обратно.`,
  })

  revalidatePath('/admin/content/channels')
  revalidatePath('/admin/content')
  return { ok: true, note: `Остановлено каналов: ${ids.length}. Запланированное осталось в плане — снимать надо отдельно.` }
}

/* ── План ───────────────────────────────────────────────────────────────── */

/**
 * Поставить публикацию в слот.
 *
 * Вся проверка — в базе: там слот, темп, актуальность материала и повтор
 * тезиса проверяются в одной транзакции. Здесь только сессия и передача.
 */
export async function schedulePublication(input: {
  channelId: number
  variantVersionId: number
  desiredAt: string
  idempotencyKey: string
  fingerprint?: string | null
}): Promise<Result & { skipped?: string; publicationId?: number }> {
  const { error: authErr, user } = await admin()
  if (authErr) return { error: authErr }
  if (!input.idempotencyKey || input.idempotencyKey.length < 8) {
    return { error: 'Нужен ключ повтора не короче восьми знаков: без него повторное нажатие поставит второй пост' }
  }
  const at = new Date(input.desiredAt)
  if (Number.isNaN(at.getTime())) return { error: 'Время слота не разобралось' }

  const content = (await createAdminClient()).schema('content' as any)
  const { data, error } = await content.rpc('schedule_publication', {
    p_channel_id: input.channelId,
    p_variant_version_id: input.variantVersionId,
    p_desired_at: at.toISOString(),
    p_idempotency_key: input.idempotencyKey,
    p_fingerprint: input.fingerprint ?? null,
  })
  if (error) return { error: error.message }

  const row: any = Array.isArray(data) ? data[0] : data
  revalidatePath('/admin/content/calendar')
  revalidatePath('/admin/content/publications')

  if (!row?.out_publication_id) {
    // Пропуск слота — обычный исход, а не ошибка. Возвращаем причину словами.
    return { ok: true, skipped: row?.out_skipped ?? 'слот пропущен' }
  }
  await journal(content, user!.name, 'schedule_publication', 'publication', row.out_publication_id, String(row.out_slot_day))
  return { ok: true, publicationId: row.out_publication_id }
}

/* ── Очередь внимания ───────────────────────────────────────────────────── */

/** Закрыть вопрос. Закрытие без объяснения — это не закрытие, а забывание. */
export async function resolveAttention(itemId: number, resolution: string): Promise<Result> {
  const { error: authErr, user } = await admin()
  if (authErr) return { error: authErr }
  if (!resolution || resolution.trim().length < 3) {
    return { error: 'Нужно написать, чем кончилось: иначе через месяц по этой строке ничего не понять' }
  }

  const content = (await createAdminClient()).schema('content' as any)
  const { data: before } = await content.from('attention_items').select('resolved_at, reason_code').eq('id', itemId).single()
  if (!before) return { error: 'Вопроса нет' }
  if ((before as any).resolved_at) return { ok: true, note: 'Вопрос уже закрыт' }

  const { error } = await content.from('attention_items')
    .update({ resolved_at: new Date().toISOString(), resolution: resolution.trim(), owner: user!.name })
    .eq('id', itemId).is('resolved_at', null)
  if (error) return { error: error.message }

  await journal(content, user!.name, 'resolve_attention', 'attention_item', itemId, (before as any).reason_code)
  revalidatePath('/admin/content/attention')
  revalidatePath('/admin/content')
  return { ok: true }
}

/* ── Разбор событий вручную ─────────────────────────────────────────────── */

/** Разобрать накопившиеся события. Обычно это делает воркер; кнопка — на случай, когда он стоит. */
export async function consumeEvents(): Promise<Result & { created?: number }> {
  const { error: authErr, user } = await admin()
  if (authErr) return { error: authErr }

  const content = (await createAdminClient()).schema('content' as any)
  const { data, error } = await content.rpc('consume_verified', { p_consumer: 'admin_button', p_limit: 50 })
  if (error) return { error: error.message }

  const rows = (data ?? []) as any[]
  const created = rows.filter((r) => r.out_created).length
  if (rows.length) await journal(content, user!.name, 'consume_events', 'outbox', null, `${rows.length} событий, ${created} новых пакетов`)

  revalidatePath('/admin/content')
  revalidatePath('/admin/content/packages')
  return { ok: true, created, note: rows.length ? `Разобрано событий: ${rows.length}` : 'Событий в очереди не было' }
}
