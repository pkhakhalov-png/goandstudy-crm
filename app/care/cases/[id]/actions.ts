'use server'

/**
 * Ручные операции над делом.
 *
 * Общее устройство у всех одинаковое и нарушать его нельзя:
 *
 *   1. кто это           — сессия контура
 *   2. можно ли ему сюда — требуетсяДоступ, который бросает, а не возвращает false
 *   3. что меняем        — одна запись
 *   4. чем объясняем     — строка в журнале, всегда, без исключений
 *
 * Четвёртый шаг не украшение. Дело ведут несколько человек, кураторы
 * меняются, а на вопрос «кто закрыл эту задачу и почему» приходится отвечать
 * через месяцы. Операция без записи в журнал — это изменение, которое никому
 * не объяснить.
 *
 * Возвращают `{ ok }` вместо исключения наружу: форма должна показать причину,
 * а не белый экран. Исключение остаётся внутри и попадает в журнал сервера.
 */
import { revalidatePath } from 'next/cache'
import { базаCare } from '@/lib/care/db'
import { требуетсяДоступ } from '@/lib/care/access'
import { сессияКонтура } from '@/lib/care/session'

type Итог = { ok: true } | { ok: false; ошибка: string }

/** Общее начало всех операций: кто и можно ли ему. */
async function подготовить(caseId: string) {
  const сессия = await сессияКонтура()
  if (!сессия?.интерфейсОткрыт) throw new Error('Кабинет недоступен')
  const участник = await требуетсяДоступ(сессия.участник, caseId)
  return { участник, база: базаCare() }
}

async function записатьВЖурнал(
  caseId: string,
  участникId: string,
  действие: string,
  было: unknown,
  стало: unknown,
  причина?: string | null
) {
  await базаCare()
    .from('events')
    .insert({
      actor_kind: 'member',
      actor_id: участникId,
      case_id: caseId,
      action: действие,
      before: было ?? null,
      after: стало ?? null,
      source: { ui: 'app/care/cases/[id]' },
      reason: причина ?? null,
    })
}

function обработать(e: unknown): Итог {
  const текст = e instanceof Error ? e.message : String(e)
  console.error('[care операция]', текст)
  return { ok: false, ошибка: текст }
}

// ── Задачи ───────────────────────────────────────────────────────────────────

export async function создатьЗадачу(caseId: string, данные: FormData): Promise<Итог> {
  try {
    const { участник, база } = await подготовить(caseId)

    const название = String(данные.get('title') ?? '').trim()
    if (!название) return { ok: false, ошибка: 'Название задачи пустое' }

    const срок = String(данные.get('due_on') ?? '').trim() || null
    const ждём = String(данные.get('waiting_on') ?? 'none')

    const { data, error } = await база
      .from('tasks')
      .insert({
        case_id: caseId,
        title: название,
        due_on: срок,
        waiting_on: ждём,
        // Задача без исполнителя — задача ничья. По умолчанию берёт тот, кто
        // её завёл: так у неё сразу есть хозяин, а переназначить можно потом.
        assignee_member_id: участник.id,
        status: ждём === 'none' ? 'todo' : 'waiting',
      })
      .select('id, title')
      .single()

    if (error) return { ok: false, ошибка: error.message }

    await записатьВЖурнал(caseId, участник.id, 'task_created', null, data)
    revalidatePath(`/care/cases/${caseId}`)
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}

export async function изменитьСтатусЗадачи(
  caseId: string,
  taskId: string,
  статус: string
): Promise<Итог> {
  try {
    const { участник, база } = await подготовить(caseId)

    // Читаем «до» ради журнала: запись «статус изменён» без прежнего значения
    // отвечает на вопрос «что стало», но не на «что было».
    const { data: было } = await база
      .from('tasks')
      .select('id, status, waiting_on')
      .eq('id', taskId)
      .eq('case_id', caseId)
      .maybeSingle()

    if (!было) return { ok: false, ошибка: 'Задача не найдена в этом деле' }

    const закрыта = статус === 'done' || статус === 'failed'
    const { error } = await база
      .from('tasks')
      .update({
        status: статус,
        closed_at: закрыта ? new Date().toISOString() : null,
        // Закрытая задача никого не ждёт. Иначе она останется висеть в
        // счётчиках ожидания и будет врать про загрузку куратора.
        waiting_on: закрыта ? 'none' : было.waiting_on,
      })
      .eq('id', taskId)
      .eq('case_id', caseId)

    if (error) return { ok: false, ошибка: error.message }

    await записатьВЖурнал(caseId, участник.id, 'task_status_changed', было, { id: taskId, status: статус })
    revalidatePath(`/care/cases/${caseId}`)
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}

// ── Факты ────────────────────────────────────────────────────────────────────

/**
 * Подтвердить черновик факта.
 *
 * Принятый факт становится текущим, а прежний текущий по тому же полю
 * уходит в `superseded`. Порядок именно такой: сначала снимаем старый, потом
 * ставим новый. В базе на `(case_id, field)` для подтверждённых стоит
 * уникальный индекс, и обратный порядок упёрся бы в него.
 */
export async function подтвердитьФакт(caseId: string, factId: string): Promise<Итог> {
  try {
    const { участник, база } = await подготовить(caseId)

    const { data: факт } = await база
      .from('facts')
      .select('id, field, value, status')
      .eq('id', factId)
      .eq('case_id', caseId)
      .maybeSingle()

    if (!факт) return { ok: false, ошибка: 'Факт не найден в этом деле' }
    if (факт.status !== 'draft') return { ok: false, ошибка: `Подтвердить можно только черновик, а этот — «${факт.status}»` }

    const { data: прежний } = await база
      .from('facts')
      .select('id')
      .eq('case_id', caseId)
      .eq('field', факт.field)
      .eq('status', 'confirmed')
      .maybeSingle()

    if (прежний) {
      const { error } = await база.from('facts').update({ status: 'superseded' }).eq('id', прежний.id)
      if (error) return { ok: false, ошибка: `не удалось снять прежний факт: ${error.message}` }
    }

    const { error } = await база
      .from('facts')
      .update({
        status: 'confirmed',
        confirmed_by: участник.id,
        confirmed_at: new Date().toISOString(),
        supersedes: прежний?.id ?? null,
      })
      .eq('id', factId)

    if (error) return { ok: false, ошибка: error.message }

    await записатьВЖурнал(caseId, участник.id, 'fact_confirmed', прежний ?? null, факт)
    revalidatePath(`/care/cases/${caseId}`)
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}

export async function отклонитьФакт(caseId: string, factId: string, причина: string): Promise<Итог> {
  try {
    const { участник, база } = await подготовить(caseId)
    if (!причина.trim()) return { ok: false, ошибка: 'Нужна причина отклонения' }

    const { data: было } = await база
      .from('facts')
      .select('id, field, value, status')
      .eq('id', factId)
      .eq('case_id', caseId)
      .maybeSingle()
    if (!было) return { ok: false, ошибка: 'Факт не найден в этом деле' }

    const { error } = await база
      .from('facts')
      .update({ status: 'rejected', reject_reason: причина.trim() })
      .eq('id', factId)
    if (error) return { ok: false, ошибка: error.message }

    await записатьВЖурнал(caseId, участник.id, 'fact_rejected', было, null, причина.trim())
    revalidatePath(`/care/cases/${caseId}`)
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}

// ── Передача дела ────────────────────────────────────────────────────────────

/**
 * Передать дело другому куратору.
 *
 * Вместе с владельцем закрываются прежние приглашения: человек, позванный
 * помочь прошлому куратору, не должен автоматически оставаться при новом.
 * Нужен — позовут заново, и это будет видно в журнале.
 */
export async function передатьДело(
  caseId: string,
  новыйУчастникId: string,
  причина: string
): Promise<Итог> {
  try {
    const { участник, база } = await подготовить(caseId)

    const { data: принимающий } = await база
      .from('members')
      .select('id, active')
      .eq('id', новыйУчастникId)
      .maybeSingle()

    if (!принимающий) return { ok: false, ошибка: 'Такого сотрудника в контуре нет' }
    if (!принимающий.active) return { ok: false, ошибка: 'Сотрудник отключён — передавать ему нельзя' }

    const { data: было } = await база
      .from('cases')
      .select('id, owner_member_id')
      .eq('id', caseId)
      .maybeSingle()

    const { error } = await база
      .from('cases')
      .update({ owner_member_id: новыйУчастникId })
      .eq('id', caseId)
    if (error) return { ok: false, ошибка: error.message }

    const сейчас = new Date().toISOString()
    await база
      .from('case_members')
      .update({ valid_to: сейчас })
      .eq('case_id', caseId)
      .is('valid_to', null)

    await записатьВЖурнал(
      caseId,
      участник.id,
      'case_transferred',
      было,
      { owner_member_id: новыйУчастникId },
      причина.trim() || null
    )
    revalidatePath(`/care/cases/${caseId}`)
    revalidatePath('/care/cases')
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}
