/**
 * «Я ответил сам» — пауза автонапоминаний по делу.
 *
 * ЗАЧЕМ. Куратор написал клиенту руками: «Иван, диплом нужен до пятницы».
 * Через час правило готовит то же самое от имени системы. Два сообщения об
 * одном и том же от разных отправителей читаются как давление, а не как
 * забота, — и именно по таким мелочам человек решает, что им занимается
 * конвейер.
 *
 * ПОЧЕМУ ОТМЕТКА РУКАМИ, А НЕ АВТОМАТ. Понять из переписки, что ответ куратора
 * относился к этой задаче, пока нечем: в группе care-бота все сообщения
 * приходят входящими, включая наши. План это предвидел — «пока определяется по
 * ручной отметке, авто-детект позже», — и ручная отметка честнее угадывания:
 * ошибка автомата здесь молчит, а кнопку нажимает тот, кто знает.
 *
 * ПОЧЕМУ ПАУЗА СРОЧНАЯ, А НЕ ВЕЧНАЯ. Через двое суток молчание перестаёт быть
 * вежливостью: если клиент так и не ответил, напомнить надо. Срок берётся из
 * настроек (`reminder_pause_hours`), по умолчанию 48 часов.
 *
 * СНЯТЬ МОЖНО РАНЬШЕ. Куратор ответил и в тот же день понял, что ответ не
 * закрыл вопрос. Отменить отметку нечем — события не стираются, — поэтому
 * снятие это второе событие, и смотрим мы на последнее из двух.
 */
import { базаCare } from './db'

const ПО_УМОЛЧАНИЮ_ЧАСОВ = 48

export const ОТМЕТКА = 'answered_manually'
export const СНЯТИЕ = 'reminders_resumed'

export type СостояниеПаузы = {
  наПаузе: boolean
  /** До какого момента молчим. */
  до: string | null
  когдаОтметили: string | null
}

/** Сколько часов держится пауза. Настройка, а не число в коде. */
export async function часыПаузы(): Promise<number> {
  const { data } = await базаCare()
    .from('settings')
    .select('value')
    .eq('key', 'reminder_pause_hours')
    .maybeSingle()
  const часов = Number(data?.value ?? ПО_УМОЛЧАНИЮ_ЧАСОВ)
  return Number.isFinite(часов) && часов > 0 ? часов : ПО_УМОЛЧАНИЮ_ЧАСОВ
}

/**
 * На паузе ли дело.
 *
 * Смотрим последнее из двух событий: отметка ставит паузу, снятие отменяет.
 * Вечно действующей отметки быть не должно — иначе дело, по которому куратор
 * однажды ответил сам, замолчит навсегда.
 */
export function разобратьСобытия(
  события: { action: string; created_at: string }[],
  часов: number
): СостояниеПаузы {
  const свои = события
    .filter((с) => с.action === ОТМЕТКА || с.action === СНЯТИЕ)
    .sort((а, б) => б.created_at.localeCompare(а.created_at))

  const последнее = свои[0]
  if (!последнее || последнее.action !== ОТМЕТКА) {
    return { наПаузе: false, до: null, когдаОтметили: null }
  }

  const до = new Date(new Date(последнее.created_at).getTime() + часов * 3_600_000)
  return {
    наПаузе: до.getTime() > Date.now(),
    до: до.toISOString(),
    когдаОтметили: последнее.created_at,
  }
}

export async function состояниеПаузы(caseId: string): Promise<СостояниеПаузы> {
  const [{ data: события }, часов] = await Promise.all([
    базаCare()
      .from('events')
      .select('action, created_at')
      .eq('case_id', caseId)
      .in('action', [ОТМЕТКА, СНЯТИЕ])
      .order('created_at', { ascending: false })
      .limit(10),
    часыПаузы(),
  ])

  return разобратьСобытия(
    (события ?? []) as { action: string; created_at: string }[],
    часов
  )
}

export type ИтогОтметки = { ok: true; текст: string } | { ok: false; ошибка: string }

/** Отметить, что куратор ответил клиенту сам. */
export async function отметитьОтвет(caseId: string, участникId: string): Promise<ИтогОтметки> {
  const часов = await часыПаузы()

  const { error } = await базаCare().from('events').insert({
    actor_kind: 'member',
    actor_id: участникId,
    case_id: caseId,
    action: ОТМЕТКА,
    after: { часов },
    source: { lib: 'lib/care/pause.ts' },
    reason: 'куратор ответил клиенту сам',
  })
  if (error) return { ok: false, ошибка: `Не отметилось: ${error.message}` }

  return {
    ok: true,
    текст: `Автонапоминания по делу молчат ${часов} ${часов === 1 ? 'час' : 'часа'}. Снять можно раньше.`,
  }
}

/** Снять паузу раньше срока. */
export async function снятьПаузу(caseId: string, участникId: string): Promise<ИтогОтметки> {
  const состояние = await состояниеПаузы(caseId)
  if (!состояние.наПаузе) return { ok: false, ошибка: 'Пауза по делу не стоит' }

  const { error } = await базаCare().from('events').insert({
    actor_kind: 'member',
    actor_id: участникId,
    case_id: caseId,
    action: СНЯТИЕ,
    source: { lib: 'lib/care/pause.ts' },
    reason: 'куратор снял паузу раньше срока',
  })
  if (error) return { ok: false, ошибка: `Не снялось: ${error.message}` }

  return { ok: true, текст: 'Пауза снята. Напоминания по делу готовятся как обычно.' }
}

/** Дела области, стоящие на паузе, — одним запросом вместо запроса на дело. */
export async function делаНаПаузе(дела: string[]): Promise<Map<string, СостояниеПаузы>> {
  const по = new Map<string, СостояниеПаузы>()
  if (!дела.length) return по

  const [{ data: события }, часов] = await Promise.all([
    базаCare()
      .from('events')
      .select('case_id, action, created_at')
      .in('case_id', дела)
      .in('action', [ОТМЕТКА, СНЯТИЕ])
      .order('created_at', { ascending: false }),
    часыПаузы(),
  ])

  const поДелу = new Map<string, { action: string; created_at: string }[]>()
  for (const с of события ?? []) {
    const id = с.case_id as string
    if (!поДелу.has(id)) поДелу.set(id, [])
    поДелу.get(id)!.push({ action: с.action as string, created_at: с.created_at as string })
  }

  for (const [id, свои] of поДелу) {
    const состояние = разобратьСобытия(свои, часов)
    if (состояние.наПаузе) по.set(id, состояние)
  }
  return по
}
