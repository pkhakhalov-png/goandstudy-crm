/**
 * Журнал отправок: что ушло, что не ушло и что осталось неизвестным.
 *
 * ЗАЧЕМ. Весь контур построен на обещании «без человека наружу ничего не
 * уходит». Проверить это обещание в кабинете было нечем: строки отправок
 * видны только в базе, и на вопрос «мы точно отправили?» ответа не было ни у
 * куратора, ни у руководителя.
 *
 * ГЛАВНОЕ ЗДЕСЬ — `unknown`. Запрос ушёл, ответа не пришло: отправлено или нет,
 * узнать нечем. Bot API не принимает вопрос «присылал ли я вот это». Контур
 * нарочно не повторяет и не считает отправленным — но тогда исход обязан
 * увидеть человек: открыть чат и сказать, дошло или нет. Пока этого экрана не
 * было, `неизвестныеИсходы()` возвращала строки, которые никто не читал.
 *
 * ОТМЕТКА НЕ ОТПРАВЛЯЕТ. Человек фиксирует то, что увидел в чате, и только. Ни
 * одного обращения к Bot API отсюда не идёт — иначе «проверил» однажды стало
 * бы «отправил второй раз».
 */
import { базаCare } from './db'

export type СтрокаОтправки = {
  id: string
  caseId: string | null
  имяПолучателя: string | null
  текст: string
  статус: 'queued' | 'sent' | 'unknown' | 'failed' | 'cancelled'
  когда: string
  отправлено: string | null
  ошибка: string | null
  причинаОтмены: string | null
  попыток: number
}

export type Отправки = {
  неизвестные: СтрокаОтправки[]
  последние: СтрокаОтправки[]
}

type Запись = {
  id: string
  proposal_id: string
  recipient: { name?: string } | null
  payload: { текст?: string } | null
  status: string
  external_id: string | null
  attempts: number
  last_error: string | null
  cancel_reason: string | null
  sent_at: string | null
  created_at: string
}

function разобрать(з: Запись, делоПоПредложению: Map<string, string>): СтрокаОтправки {
  return {
    id: з.id,
    caseId: делоПоПредложению.get(з.proposal_id) ?? null,
    имяПолучателя: з.recipient?.name ?? null,
    текст: з.payload?.текст ?? '',
    статус: з.status as СтрокаОтправки['статус'],
    когда: з.created_at,
    отправлено: з.sent_at,
    ошибка: з.last_error,
    // У причины отмены свой столбец (миграция 010), и читать её надо оттуда.
    // Сначала я читал `last_error` — экран молчал бы о каждой отмене, а
    // вчерашняя проверка это пропустила: фикстура подыгрывала коду, записывая
    // причину туда же, откуда он её брал.
    причинаОтмены: з.cancel_reason,
    попыток: з.attempts,
  }
}

/** Отправки по видимым делам: неизвестные отдельно, остальные списком. */
export async function отправки(дела: string[], сколько = 30): Promise<Отправки> {
  if (!дела.length) return { неизвестные: [], последние: [] }

  const { data: предложения } = await базаCare()
    .from('proposals')
    .select('id, case_id')
    .in('case_id', дела)

  const делоПоПредложению = new Map(
    (предложения ?? []).map((п) => [п.id as string, п.case_id as string])
  )
  if (!делоПоПредложению.size) return { неизвестные: [], последние: [] }

  const { data } = await базаCare()
    .from('outbound_actions')
    .select('id, proposal_id, recipient, payload, status, external_id, attempts, last_error, cancel_reason, sent_at, created_at')
    .in('proposal_id', [...делоПоПредложению.keys()])
    .order('created_at', { ascending: false })
    .limit(сколько * 3)

  const все = ((data ?? []) as Запись[]).map((з) => разобрать(з, делоПоПредложению))

  return {
    // Неизвестные наверх и без ограничения: это работа, а не история.
    неизвестные: все.filter((с) => с.статус === 'unknown'),
    последние: все.filter((с) => с.статус !== 'unknown').slice(0, сколько),
  }
}

export type ИтогОтметки = { ok: true; текст: string } | { ok: false; ошибка: string }

/**
 * Отметить исход, который человек проверил глазами.
 *
 * `дошло = true` → `sent`: сообщение в чате есть. `false` → `failed`: его там
 * нет, и можно готовить новое. Ничего не отправляет.
 */
export async function отметитьИсход(
  id: string,
  дошло: boolean,
  участникId: string
): Promise<ИтогОтметки> {
  const { data: запись } = await базаCare()
    .from('outbound_actions')
    .select('id, status, proposal_id')
    .eq('id', id)
    .maybeSingle()

  if (!запись) return { ok: false, ошибка: 'Такой отправки нет' }
  if (запись.status !== 'unknown') {
    // Исход уже известен — переписывать его отметкой нельзя: вторая вкладка
    // не должна превращать отправленное в неотправленное.
    return { ok: false, ошибка: 'Исход этой отправки уже известен' }
  }

  const { error } = await базаCare()
    .from('outbound_actions')
    .update({
      status: дошло ? 'sent' : 'failed',
      sent_at: дошло ? new Date().toISOString() : null,
      last_error: дошло ? null : 'проверено человеком: сообщения в чате нет',
    })
    .eq('id', id)
    .eq('status', 'unknown')
  if (error) return { ok: false, ошибка: `Не отметилось: ${error.message}` }

  const { data: предложение } = await базаCare()
    .from('proposals')
    .select('case_id')
    .eq('id', запись.proposal_id)
    .maybeSingle()

  await базаCare().from('events').insert({
    actor_kind: 'member',
    actor_id: участникId,
    case_id: предложение?.case_id ?? null,
    action: дошло ? 'outbound_confirmed' : 'outbound_denied',
    after: { outbound_action_id: id },
    source: { ui: 'app/care/review/sends' },
    reason: дошло
      ? 'человек проверил чат: сообщение дошло'
      : 'человек проверил чат: сообщения нет',
  })

  return {
    ok: true,
    текст: дошло
      ? 'Отмечено как доставленное. Повторно ничего не отправляется.'
      : 'Отмечено как недоставленное. Напоминание по задаче можно подготовить заново.',
  }
}
