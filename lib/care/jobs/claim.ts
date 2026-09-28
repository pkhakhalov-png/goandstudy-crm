/**
 * Работа с очередью заданий.
 *
 * Тонкая обёртка над функциями базы. Логика выдачи живёт в SQL намеренно:
 * «не выдать одно задание двум воркерам» решается блокировкой строки, и
 * повторить это в TypeScript нечем — между SELECT и UPDATE всегда есть
 * промежуток, в который успевает влезть соседний воркер.
 */
import { базаCare } from '../db'

export type Задание = {
  id: string
  kind: string
  payload: Record<string, unknown>
  priority: number
  attempts: number
  max_attempts: number
  result: Record<string, unknown>
  case_id: string | null
}

/**
 * Взять до `сколько` заданий под именем воркера.
 *
 * Имя воркера должно быть разным у разных запусков: по нему определяется, чей
 * результат принимать. Одинаковое имя у двух тиков означает, что второй сможет
 * закрыть задание первого.
 */
export async function взятьЗадания(воркер: string, сколько = 5): Promise<Задание[]> {
  const { data, error } = await базаCare().rpc('claim_jobs', {
    p_worker: воркер,
    p_limit: сколько,
  })
  if (error) throw new Error(`не удалось взять задания: ${error.message}`)
  return (data ?? []) as Задание[]
}

/**
 * Сохранить промежуточный результат и продлить аренду.
 *
 * `false` означает, что задание уже отобрано по истечении аренды — продолжать
 * бессмысленно, его взял кто-то другой.
 */
export async function сохранитьПрогресс(
  задание: string,
  воркер: string,
  результат: Record<string, unknown>
): Promise<boolean> {
  const { data, error } = await базаCare().rpc('save_progress', {
    p_job: задание,
    p_worker: воркер,
    p_result: результат,
  })
  if (error) throw new Error(`не удалось сохранить прогресс: ${error.message}`)
  return data === true
}

/** Продлить аренду, не записывая результат. Для шагов без промежуточного состояния. */
export async function продлитьАренду(задание: string, воркер: string, секунд = 300): Promise<boolean> {
  const { data, error } = await базаCare().rpc('extend_lease', {
    p_job: задание,
    p_worker: воркер,
    p_seconds: секунд,
  })
  if (error) throw new Error(`не удалось продлить аренду: ${error.message}`)
  return data === true
}

/**
 * Закрыть задание.
 *
 * `false` — результат опоздал: аренда истекла, задание вернулось в очередь и,
 * возможно, уже выполнено другим воркером. Записывать поверх нельзя.
 */
export async function закрытьЗадание(
  задание: string,
  воркер: string,
  успех: boolean,
  результат: Record<string, unknown> = {},
  ошибка: string | null = null
): Promise<boolean> {
  const { data, error } = await базаCare().rpc('release', {
    p_job: задание,
    p_worker: воркер,
    p_ok: успех,
    p_result: результат,
    p_error: ошибка,
  })
  if (error) throw new Error(`не удалось закрыть задание: ${error.message}`)
  return data === true
}
