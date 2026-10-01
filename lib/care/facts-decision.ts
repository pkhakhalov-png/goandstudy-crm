/**
 * Решения по расхождениям: принять, уточнить, отклонить.
 *
 * ПОЧЕМУ ОТДЕЛЬНО ОТ ДЕЙСТВИЙ ЭКРАНА. Здесь переписывается то, что куратор
 * однажды уже подтвердил, — и это надо проверять тестом, а не глазами. Серверное
 * действие знает про сессию и права, а что именно происходит с фактами — знает
 * этот файл, и его можно позвать напрямую.
 *
 * ГЛАВНОЕ ПРАВИЛО. Старое значение не удаляется, а становится `superseded`.
 * Через месяц вопрос «а почему у нас было двенадцать тысяч» должен иметь ответ,
 * а не пустоту.
 *
 * ЧЕГО ЗДЕСЬ НЕТ НАРОЧНО. Пересборки подборки. План прямо это запрещает на
 * этом этапе, и запрет правильный: приняв новый бюджет, куратор ещё не решил,
 * что делать со списком, который выверил руками. Он увидит полосу «основание
 * изменилось» в карточке и нажмёт «Найти замену» сам, когда будет готов.
 */
import { базаCare } from './db'
import type { Участник } from './access'

export type ИтогРешения = { ok: true; текст: string } | { ok: false; ошибка: string }

export type ГрузРасхождения = {
  field?: string
  было?: unknown
  стало?: unknown
  цитата?: string
}

/** Предложение и его груз — или внятный отказ. */
export async function расхождение(
  proposalId: string
): Promise<{ ok: true; caseId: string; груз: ГрузРасхождения } | { ok: false; ошибка: string }> {
  const { data } = await базаCare()
    .from('proposals')
    .select('id, case_id, kind, status, payload')
    .eq('id', proposalId)
    .maybeSingle()

  if (!data) return { ok: false, ошибка: 'Расхождение не найдено' }
  if (data.kind !== 'fact_update') return { ok: false, ошибка: 'Это не расхождение сведений' }
  if (data.status !== 'pending') return { ok: false, ошибка: 'По нему уже решили' }

  return { ok: true, caseId: data.case_id as string, груз: (data.payload ?? {}) as ГрузРасхождения }
}

/** Обе стороны расхождения: что записано и что услышали. */
async function стороны(caseId: string, груз: ГрузРасхождения) {
  const { data } = await базаCare()
    .from('facts')
    .select('id, value, status')
    .eq('case_id', caseId)
    .eq('field', груз.field ?? '')

  return {
    подтверждённый: (data ?? []).find((ф) => ф.status === 'confirmed') ?? null,
    черновик:
      (data ?? []).find((ф) => ф.status === 'draft' && String(ф.value) === String(груз.стало)) ??
      null,
  }
}

/**
 * Закрыть предложение — с проверкой, что оно действительно закрылось.
 *
 * ПОЧЕМУ ОТДЕЛЬНО И С ПРОВЕРКОЙ. Первая версия писала состояния `done` и
 * `skipped`, которых в ограничении таблицы нет. База отвергала запись, код
 * ошибку не смотрел, а экран отвечал «Принято». Куратор видел бы
 * подтверждение решения, которого не произошло, — и узнал бы об этом, только
 * встретив то же расхождение завтра.
 */
async function закрытьПредложение(
  proposalId: string,
  состояние: 'accepted' | 'rejected' | 'clarifying',
  участникId: string,
  причина?: string
): Promise<ИтогРешения> {
  const { data, error } = await базаCare()
    .from('proposals')
    .update({
      status: состояние,
      decided_by: участникId,
      decided_at: new Date().toISOString(),
      ...(причина ? { reason: причина } : {}),
    })
    .eq('id', proposalId)
    .select('id')

  if (error) return { ok: false, ошибка: `Решение не записалось: ${error.message}` }
  // Пустой ответ при отсутствии ошибки — это строка, не прошедшая под правила
  // доступа. Молча считать это успехом нельзя.
  if (!data?.length) return { ok: false, ошибка: 'Решение не записалось: предложение не обновилось' }
  return { ok: true, текст: '' }
}

async function закрытьКонфликт(caseId: string, поле: string, участникId: string) {
  await базаCare()
    .from('fact_conflicts')
    .update({ resolved_at: new Date().toISOString(), resolved_by: участникId })
    .eq('case_id', caseId)
    .eq('field', поле)
    .is('resolved_at', null)
}

export async function принятьРасхождение(
  участник: Участник,
  proposalId: string
): Promise<ИтогРешения> {
  const п = await расхождение(proposalId)
  if (!п.ok) return п

  const { подтверждённый, черновик } = await стороны(п.caseId, п.груз)
  if (!черновик) return { ok: false, ошибка: 'Новое значение не нашлось — расхождение устарело' }

  if (подтверждённый) {
    // Не удаляем: «а почему у нас было двенадцать тысяч» — обычный вопрос
    // через месяц, и у него должен быть ответ.
    await базаCare().from('facts').update({ status: 'superseded' }).eq('id', подтверждённый.id)
  }

  await базаCare()
    .from('facts')
    .update({
      status: 'confirmed',
      confirmed_by: участник.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', черновик.id)

  await закрытьКонфликт(п.caseId, п.груз.field ?? '', участник.id)
  const закрыто = await закрытьПредложение(proposalId, 'accepted', участник.id)
  if (!закрыто.ok) return закрыто

  await базаCare().from('events').insert({
    actor_kind: 'member',
    actor_id: участник.id,
    case_id: п.caseId,
    action: 'fact_superseded',
    before: { поле: п.груз.field, значение: п.груз.было },
    after: { поле: п.груз.field, значение: п.груз.стало },
    source: { lib: 'lib/care/facts-decision.ts' },
    reason: 'куратор принял новое значение',
  })

  return { ok: true, текст: 'Принято. Прежнее значение осталось в истории дела.' }
}

export async function отклонитьРасхождение(
  участник: Участник,
  proposalId: string,
  причина: string
): Promise<ИтогРешения> {
  const текст = причина.trim()
  // Причина обязательна: отклонённое больше не предлагается, и через месяц
  // «почему мы это отбросили» не должно упираться в пустоту.
  if (!текст) return { ok: false, ошибка: 'Без причины отклонять нельзя' }

  const п = await расхождение(proposalId)
  if (!п.ok) return п

  const { черновик } = await стороны(п.caseId, п.груз)
  if (черновик) {
    await базаCare().from('facts').update({ status: 'rejected' }).eq('id', черновик.id)
  }

  await закрытьКонфликт(п.caseId, п.груз.field ?? '', участник.id)
  const закрыто = await закрытьПредложение(proposalId, 'rejected', участник.id, текст)
  if (!закрыто.ok) return закрыто

  await базаCare().from('events').insert({
    actor_kind: 'member',
    actor_id: участник.id,
    case_id: п.caseId,
    action: 'fact_rejected',
    before: { поле: п.груз.field, значение: п.груз.было },
    after: { поле: п.груз.field, отклонено: п.груз.стало },
    source: { lib: 'lib/care/facts-decision.ts' },
    reason: текст,
  })

  return { ok: true, текст: 'Отклонено. Прежнее значение осталось действующим.' }
}

/**
 * «Уточнить»: ни одно из значений не принимается, вопрос уходит клиенту.
 *
 * ПОЧЕМУ ПРЕДЛОЖЕНИЕ ПРИ ЭТОМ ЗАКРЫВАЕТСЯ. Оставить его в очереди значит
 * показывать куратору один и тот же вопрос каждый день, пока клиент не
 * ответит. Очередь, в которой лежит неотвечаемое, перестаёт читаться целиком.
 * Вопрос живёт в задаче со сроком — там ему и место.
 *
 * Черновик остаётся черновиком: клиент это сказал, и стирать его слова мы не
 * вправе. Подтверждённое тоже не трогаем — до ответа действует оно.
 */
export async function уточнитьРасхождение(
  участник: Участник,
  proposalId: string
): Promise<ИтогРешения> {
  const п = await расхождение(proposalId)
  if (!п.ok) return п

  const вопрос = `Уточнить: ${п.груз.field ?? 'сведения'} — было «${п.груз.было}», услышали «${п.груз.стало}»`.slice(
    0,
    180
  )

  const { error } = await базаCare()
    .from('tasks')
    .insert({
      case_id: п.caseId,
      title: вопрос,
      details: п.груз.цитата ? `Со слов клиента: «${п.груз.цитата}»` : null,
      waiting_on: 'client',
      status: 'waiting',
      assignee_member_id: участник.id,
    })
  if (error) return { ok: false, ошибка: `Задача не завелась: ${error.message}` }

  const закрыто = await закрытьПредложение(
    proposalId,
    'clarifying',
    участник.id,
    'ушло в задачу «уточнить у клиента»'
  )
  if (!закрыто.ok) return закрыто

  await базаCare().from('events').insert({
    actor_kind: 'member',
    actor_id: участник.id,
    case_id: п.caseId,
    action: 'fact_clarification_requested',
    after: { поле: п.груз.field, было: п.груз.было, стало: п.груз.стало },
    source: { lib: 'lib/care/facts-decision.ts' },
    reason: 'куратор решил уточнить у клиента',
  })

  return { ok: true, текст: 'Завёл задачу «ждём клиента». Сведения остались прежними до ответа.' }
}
