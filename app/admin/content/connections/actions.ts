'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { площадка } from '@/lib/content/platforms'
import { проверить, секретДля } from '@/lib/content/probe'

type Ответ = { ok: true; строки: string[]; итог: string } | { error: string }

/**
 * Сессия и роль проверяются здесь, а не только в оболочке раздела: серверное
 * действие вызывается по своему адресу, и экран для этого не нужен.
 */
async function админ() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' as const, кто: null }
  const { data: profile } = await supabase.from('users').select('role, name').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Только админ' as const, кто: null }
  return { error: null, кто: profile?.name || user.email || user.id }
}

/**
 * Проверить подключение к площадке живым вызовом.
 *
 * Результат пишется в `connector_capabilities` — в том числе неудачный. Это
 * важнее, чем кажется: без записи о неудаче экран после проверки выглядит ровно
 * так же, как до неё, и человек нажимает кнопку по второму разу, думая, что
 * первый не сработал.
 */
export async function проверитьПодключение(код: string): Promise<Ответ> {
  const { error: нельзя, кто } = await админ()
  if (нельзя) return { error: нельзя }

  const п = площадка(код)
  if (!п) return { error: `Площадки «${код}» нет в реестре` }

  const content = (await createAdminClient()).schema('content' as any)
  const { data: каналы } = await content.from('channels')
    .select('account_external_id').eq('platform', код)
  const аккаунты = (каналы ?? []).map((к: any) => String(к.account_external_id))

  const итог = await проверить(п, { секрет: секретДля(п), аккаунты })

  // Проверка площадки целиком, без разбивки по аккаунтам. Признак этого — «*»
  // в account_external_id, а не NULL: уникальность (platform, account) в
  // Postgres не работает по NULL, и каждая проверка добавляла бы новую строку
  // вместо обновления прежней.
  const { error } = await content.from('connector_capabilities').upsert({
    platform: код,
    account_external_id: '*',
    verified_formats: итог.действия.length ? ['social_post'] : [],
    verified_actions: итог.действия,
    docs_url: п.док ?? null,
    checked_at: new Date().toISOString(),
    proof_ref: итог.след.slice(0, 500),
  }, { onConflict: 'platform,account_external_id' })
  if (error) return { error: `Проверка прошла, но записать результат не удалось: ${error.message}` }

  await content.from('audit_events').insert({
    actor: кто, operation: 'probe_connection', entity_type: 'platform', entity_id: null,
    new_hash: `${код}: ${итог.ок ? 'ok' : 'fail'} — ${итог.след}`.slice(0, 400),
  })

  revalidatePath('/admin/content/connections')
  return { ok: true, строки: итог.подробно, итог: итог.след }
}
