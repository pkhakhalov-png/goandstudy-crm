'use server'

/**
 * Решения по подборкам.
 *
 * Две операции: принять и отправить на доработку. Устройство то же, что у
 * прочих операций контура: кто это → можно ли ему сюда → одна запись → строка
 * в журнале.
 *
 * ПОЧЕМУ «НА ДОРАБОТКУ» СРАЗУ ПЕРЕСОБИРАЕТ. Куратор написал, что не так, —
 * значит он уже сформулировал запрос. Оставить замечание лежать и попросить
 * его нажать ещё одну кнопку в карточке значит потерять половину замечаний
 * где-то между экранами.
 */
import { revalidatePath } from 'next/cache'
import { базаCare } from '@/lib/care/db'
import { требуетсяДоступ } from '@/lib/care/access'
import { сессияКонтура } from '@/lib/care/session'

export type Итог =
  | { ok: true; сообщение?: string }
  | { ok: false; ошибка: string }

async function подготовить(shortlistId: string) {
  const сессия = await сессияКонтура()
  if (!сессия?.участник || !сессия.интерфейсОткрыт) throw new Error('Кабинет недоступен')

  const { data: подборка } = await базаCare()
    .from('shortlists')
    .select('id, case_id, status, version')
    .eq('id', shortlistId)
    .maybeSingle()
  if (!подборка) throw new Error('Подборка не найдена')

  const участник = await требуетсяДоступ(сессия.участник, подборка.case_id as string)
  return { участник, подборка }
}

function обработать(e: unknown): Итог {
  const текст = e instanceof Error ? e.message : String(e)
  console.error('[care подборки]', текст)
  return { ok: false, ошибка: текст }
}

/** Принять подборку и собрать страницу для клиента. */
export async function принятьПодборку(shortlistId: string): Promise<Итог> {
  try {
    const { подборка } = await подготовить(shortlistId)
    const { опубликоватьПодборку } = await import('../../cases/[id]/actions')

    const итог = await опубликоватьПодборку(подборка.case_id as string, shortlistId)
    revalidatePath('/care/review/shortlists')
    if (!итог.ok) return { ok: false, ошибка: итог.ошибка }
    return { ok: true, сообщение: 'Принято. Ссылка для клиента — в карточке дела.' }
  } catch (e) {
    return обработать(e)
  }
}

/**
 * Отправить на доработку с замечанием и сразу собрать новую версию.
 *
 * Замечание обязательно: «не то» без объяснения не помогает ни помощнику, ни
 * куратору, который вернётся к этой подборке через неделю.
 */
export async function доработатьПодборку(shortlistId: string, замечание: string): Promise<Итог> {
  try {
    if (!замечание.trim()) return { ok: false, ошибка: 'Нужно сказать, что не так — иначе переподбор даст то же самое' }

    const { участник, подборка } = await подготовить(shortlistId)
    const { собратьПодборку } = await import('@/lib/care/jobs/shortlist')

    await базаCare()
      .from('shortlists')
      .update({
        status: 'rejected',
        reviewed_by: участник.id,
        reviewed_at: new Date().toISOString(),
        review_note: замечание.trim(),
      })
      .eq('id', shortlistId)

    await базаCare().from('events').insert({
      actor_kind: 'member',
      actor_id: участник.id,
      case_id: подборка.case_id,
      action: 'shortlist_rework',
      after: { shortlist_id: shortlistId, версия: подборка.version },
      source: { ui: '/care/review/shortlists' },
      reason: замечание.trim(),
    })

    const новая = await собратьПодборку(подборка.case_id as string, замечание)

    revalidatePath('/care/review/shortlists')
    revalidatePath(`/care/cases/${подборка.case_id}`)

    if (!новая.программ) {
      // Прежняя уже отклонена, и это правильно: она куратору не подошла.
      // Но сказать, что новой нет, надо прямо — иначе очередь просто опустеет.
      return {
        ok: false,
        ошибка: `Прежняя отклонена, но новая не собралась: ${новая.причины.join('; ') || 'ничего не нашлось'}`,
      }
    }

    return { ok: true, сообщение: `Собрана новая версия: ${новая.программ} программ.` }
  } catch (e) {
    return обработать(e)
  }
}
