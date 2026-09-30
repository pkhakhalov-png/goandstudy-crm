'use server'

/**
 * Решения по напоминаниям.
 *
 * Две операции: отправить и пропустить. Обе требуют, чтобы дело было в
 * области куратора, и обе пишут в журнал — через полгода на вопрос «почему
 * клиенту ушло вот это» должен быть ответ.
 *
 * Отправка не отправляет напрямую: она ставит в очередь через ворота, а
 * ворота могут отказать. Отказ — не ошибка интерфейса, а результат, и он
 * возвращается человеку словами.
 */
import { revalidatePath } from 'next/cache'
import { базаCare } from '@/lib/care/db'
import { требуетсяДоступ } from '@/lib/care/access'
import { сессияКонтура } from '@/lib/care/session'
import { поставитьВОчередь } from '@/lib/care/gate/outbound'

export type Итог =
  | { ok: true; вОчереди: true }
  | { ok: true; вОчереди: false; объяснение: string }
  | { ok: false; ошибка: string }

async function подготовить(proposalId: string) {
  const сессия = await сессияКонтура()
  if (!сессия?.участник || !сессия.интерфейсОткрыт) throw new Error('Кабинет недоступен')

  const { data: предложение } = await базаCare()
    .from('proposals')
    .select('id, case_id, status')
    .eq('id', proposalId)
    .maybeSingle()
  if (!предложение) throw new Error('Предложение не найдено')

  const участник = await требуетсяДоступ(сессия.участник, предложение.case_id)
  return { участник, предложение }
}

export async function отправитьНапоминание(proposalId: string): Promise<Итог> {
  try {
    const { участник } = await подготовить(proposalId)
    const итог = await поставитьВОчередь(proposalId, участник.id)
    revalidatePath('/care/review/reminders')

    if (итог.ok) return { ok: true, вОчереди: true }
    // Отказ ворот — штатный исход, а не сбой. Возвращаем объяснение, а не
    // сообщение об ошибке: человек должен понять, что делать дальше.
    return { ok: true, вОчереди: false, объяснение: итог.объяснение }
  } catch (e) {
    return { ok: false, ошибка: e instanceof Error ? e.message : String(e) }
  }
}

export async function пропуститьНапоминание(proposalId: string, причина: string): Promise<Итог> {
  try {
    // Причина обязательна. Пропуск без объяснения ничему не учит: через месяц
    // непонятно, был ли шаблон плохим, клиент особенным или момент неудачным.
    if (!причина.trim()) return { ok: false, ошибка: 'Нужна причина — почему не отправляем' }

    const { участник, предложение } = await подготовить(proposalId)

    await базаCare()
      .from('proposals')
      .update({
        status: 'rejected',
        decided_by: участник.id,
        decided_at: new Date().toISOString(),
        reason: причина.trim(),
      })
      .eq('id', proposalId)

    await базаCare().from('events').insert({
      actor_kind: 'member',
      actor_id: участник.id,
      case_id: предложение.case_id,
      action: 'reminder_skipped',
      after: { proposal_id: proposalId },
      source: { ui: '/care/review/reminders' },
      reason: причина.trim(),
    })

    revalidatePath('/care/review/reminders')
    return { ok: true, вОчереди: false, объяснение: 'Пропущено.' }
  } catch (e) {
    return { ok: false, ошибка: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * «Я ответил сам» — ставит паузу автонапоминаниям по делу.
 *
 * Пока авто-детект по переписке не сделан, это ручная отметка. Без неё
 * куратор пишет клиенту, а через час автомат присылает то же самое второй
 * раз — и это читается как давление, а не как забота.
 */
export async function ответилСам(proposalId: string): Promise<Итог> {
  try {
    const { участник, предложение } = await подготовить(proposalId)

    await базаCare()
      .from('proposals')
      .update({
        status: 'rejected',
        decided_by: участник.id,
        decided_at: new Date().toISOString(),
        reason: 'куратор написал клиенту сам',
      })
      .eq('id', proposalId)

    await базаCare().from('events').insert({
      actor_kind: 'member',
      actor_id: участник.id,
      case_id: предложение.case_id,
      action: 'answered_manually',
      after: { proposal_id: proposalId },
      source: { ui: '/care/review/reminders' },
      reason: 'пауза автонапоминаниям по этому делу',
    })

    revalidatePath('/care/review/reminders')
    return { ok: true, вОчереди: false, объяснение: 'Отмечено. Автонапоминания по этому делу на паузе.' }
  } catch (e) {
    return { ok: false, ошибка: e instanceof Error ? e.message : String(e) }
  }
}
