'use server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { проверитьВыход, следствиеВыхода } from '@/lib/content/manual-publish'

type Ответ = { ok: true; note: string } | { error: string }

/**
 * Человек опубликовал материал руками и вернул адрес поста.
 *
 * Отметка и проверка разделены нарочно. Отметка — это слова человека: он мог
 * ошибиться адресом, вставить черновик или закрытый пост. Поэтому сразу после
 * отметки страница читается, и результат чтения пишется отдельно: «прочитали и
 * нашли метку», «прочитали, метки нет», «не смогли прочитать». Последнее — не
 * «пост не вышел», и в таблице оно выглядит иначе.
 */
export async function отметитьОпубликованным(публикацияId: number, адрес: string): Promise<Ответ> {
  const url = адрес.trim()
  if (!/^https?:\/\/\S+$/.test(url)) return { error: 'Нужен адрес поста целиком, вместе с https://' }

  const content = (await createAdminClient()).schema('content' as any)

  const { data: паб } = await content.from('publications')
    .select('id, status, channel_id, remote_url').eq('id', публикацияId).maybeSingle()
  if (!паб) return { error: `Публикации #${публикацияId} нет` }
  if (паб.status === 'published') return { error: 'Эта публикация уже отмечена вышедшей' }

  // Попытка записывается ДО отметки — по тем же правилам, что у автоматической
  // отправки: сначала след, потом факт. Иначе после сбоя не остаётся даже следа
  // того, что человек что-то делал.
  const { data: прошлые } = await content.from('publication_attempts')
    .select('attempt').eq('publication_id', публикацияId).order('attempt', { ascending: false }).limit(1)
  const номер = ((прошлые?.[0]?.attempt as number) ?? 0) + 1

  await content.from('publication_attempts').insert({
    publication_id: публикацияId, attempt: номер, phase: 'руками',
    result: 'человек опубликовал и вернул адрес', started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  })

  const выход = await проверитьВыход(url, публикацияId)
  const след = следствиеВыхода(выход)

  const { error } = await content.from('publications').update({
    status: 'published',
    remote_url: url,
    // Идентификатор поста у ручных площадок — хвост адреса: другого у нас нет,
    // и он нужен, чтобы повтор отметки не создал вторую запись.
    remote_id: url.replace(/\/$/, '').split('/').pop() ?? null,
    link_clickable: след.link_clickable,
    last_verified_at: след.last_verified_at,
  }).eq('id', публикацияId)
  if (error) return { error: `Не записалось: ${error.message}` }

  // Не прочитали пост — это повод посмотреть человеку, а не тихо забыть: без
  // проверки выхода мы знаем только то, что кто-то нажал кнопку.
  if (выход.вид === 'не_проверить' || выход.вид === 'виден_без_метки') {
    const { data: уже } = await content.from('attention_items').select('id')
      .eq('reason_code', выход.вид === 'не_проверить' ? 'manual_publish_unverified' : 'manual_publish_no_utm')
      .eq('entity_type', 'publication').eq('entity_id', публикацияId).is('resolved_at', null).limit(1)
    if (!уже?.length) {
      await content.from('attention_items').insert({
        reason_code: выход.вид === 'не_проверить' ? 'manual_publish_unverified' : 'manual_publish_no_utm',
        severity: выход.вид === 'не_проверить' ? 'low' : 'medium',
        entity_type: 'publication', entity_id: публикацияId,
        suggested_action: `${след.пояснение} Адрес: ${url}`,
      })
    }
  }

  revalidatePath('/admin/content/export')
  revalidatePath(`/admin/content/publications/${публикацияId}`)
  return { ok: true, note: след.пояснение }
}

/** Материал не годится к выкладке: снять из очереди рук, оставив след. */
export async function отложить(публикацияId: number, почему: string): Promise<Ответ> {
  if (!почему.trim()) return { error: 'Нужна причина — без неё через неделю никто не вспомнит, почему сняли' }
  const content = (await createAdminClient()).schema('content' as any)

  const { error } = await content.from('publications')
    .update({ status: 'cancelled' }).eq('id', публикацияId)
  if (error) return { error: `Не записалось: ${error.message}` }

  await content.from('attention_items').insert({
    reason_code: 'manual_publish_cancelled', severity: 'low',
    entity_type: 'publication', entity_id: публикацияId,
    suggested_action: `Снято из очереди ручной выкладки: ${почему.trim()}`,
  })

  revalidatePath('/admin/content/export')
  return { ok: true, note: 'Снято из очереди' }
}
