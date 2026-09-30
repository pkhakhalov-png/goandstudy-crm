/**
 * Ворота отправки. Единственная дверь наружу.
 *
 * Пять проверок, все обязательные, порядок не случаен: сначала то, что
 * запрещает отправку вообще, потом то, что запрещает эту конкретную.
 *
 *   1. Рубильник в базе  — `care.env_marker.external_sends`
 *   2. Флаг клиента      — `outbound` включён именно ему
 *   3. Свежесть данных   — мир не изменился с момента подготовки
 *   4. Тихие часы        — не будим человека ночью
 *   5. Получатель        — берётся из дела, НЕ из текста предложения
 *
 * ПОЧЕМУ ПЯТАЯ ПРОВЕРКА ИМЕННО ТАКАЯ. Адрес в payload означал бы, что
 * подменённый текст уводит сообщение на чужой чат. Предложение готовит
 * модель, а модель читает переписку, в которой может оказаться «отправь это
 * на такой-то адрес». Получатель берётся из `care.contacts` дела, и никакой
 * текст на это не влияет.
 *
 * ПОЧЕМУ ОТКАЗ ТОЖЕ ЗАПИСЫВАЕТСЯ. Отказ без следа выглядит как «ничего не
 * произошло»: куратор нажал кнопку, ничего не случилось, он нажимает снова.
 * Строка в `outbound_actions` со статусом `cancelled` и причиной отвечает на
 * вопрос «почему не ушло» через месяц, а не только в момент нажатия.
 *
 * В этом файле нет ни одного вызова Bot API. Ворота решают, можно ли; шлёт
 * воркер, и только то, что прошло здесь.
 */
import { createHash } from 'crypto'
import { базаCare, базаPublic } from '../db'
import { режим } from '../mode'
import { флагВключён } from '../flags'

export type КодОтказа =
  | 'sends_disabled'
  | 'flag_off'
  | 'stale_data'
  | 'quiet_hours'
  | 'no_recipient'
  | 'already_handled'
  | 'not_pending'

export type РешениеВорот =
  | { разрешено: true; chatId: number; имяПолучателя: string }
  | { разрешено: false; причина: КодОтказа; объяснение: string }

/** Человеческие формулировки отказов. Показываются куратору как есть. */
export const ОБЪЯСНЕНИЕ: Record<КодОтказа, string> = {
  sends_disabled: 'Внешние отправки выключены в базе. Это рубильник контура, он меняется только миграцией.',
  flag_off: 'Этому клиенту не включены отправки. Включается флагом outbound по конкретному клиенту.',
  stale_data: 'Данные изменились с момента подготовки — клиент мог уже прислать документ. Нужно новое предложение.',
  quiet_hours: 'Сейчас тихие часы. Отправка возможна в рабочее время.',
  no_recipient: 'У дела не указан чат в Телеграме — отправлять некуда.',
  already_handled: 'По этому предложению отправка уже создана.',
  not_pending: 'Предложение уже не ждёт решения.',
}

/**
 * Слепок состояния дела на момент подготовки предложения.
 *
 * В него входит ровно то, из-за чего напоминание может стать неуместным:
 * состояние задачи и список документов клиента. Если студент прислал
 * документ между подготовкой и нажатием кнопки, хэш разойдётся, и
 * напоминание не уйдёт.
 *
 * Это не защита от гонок в базе, а защита от неловкости: напоминание о том,
 * что человек уже сделал, стоит доверия дороже, чем выигрыш от автоматизации.
 */
export async function версияДанных(caseId: string, taskId: string | null): Promise<string> {
  const [{ data: дело }, { data: задача }] = await Promise.all([
    базаCare().from('cases').select('client_id, is_synthetic').eq('id', caseId).maybeSingle(),
    taskId
      ? базаCare().from('tasks').select('id, status, waiting_on, due_on, updated_at').eq('id', taskId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  let документы: unknown = []
  if (дело && !дело.is_synthetic) {
    const { data } = await базаPublic()
      .from('client_documents')
      .select('id, doc_type, status, uploaded_at')
      .eq('client_id', дело.client_id)
      .order('id')
    документы = data ?? []
  }

  return createHash('sha256')
    .update(JSON.stringify({ задача, документы }))
    .digest('hex')
    .slice(0, 32)
}

/** Тихие часы из настроек. По умолчанию с 21:00 до 09:00. */
async function вТихиеЧасы(): Promise<boolean> {
  const { data } = await базаCare()
    .from('settings')
    .select('key, value')
    .in('key', ['quiet_hours', 'timezone'])

  const настройки = new Map((data ?? []).map((с) => [с.key as string, с.value]))
  const часы = (настройки.get('quiet_hours') ?? { from: '21:00', to: '09:00' }) as { from: string; to: string }
  const пояс = (настройки.get('timezone') as string | undefined) ?? 'Europe/Moscow'

  // Время считаем в поясе клиента, а не сервера: сервер в другом часовом
  // поясе — обычное дело, и «девять утра» у него может быть ночью у человека.
  const сейчас = new Intl.DateTimeFormat('ru-RU', {
    timeZone: пояс,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())

  const вМинуты = (t: string) => {
    const [ч, м] = t.split(':').map(Number)
    return ч * 60 + (м || 0)
  }

  const т = вМинуты(сейчас)
  const с = вМинуты(часы.from)
  const по = вМинуты(часы.to)

  // Окно через полночь: 21:00–09:00 значит «после 21 ИЛИ до 9».
  return с > по ? т >= с || т < по : т >= с && т < по
}

/**
 * Можно ли отправить это предложение прямо сейчас.
 *
 * Ничего не записывает — только отвечает. Запись делает `поставитьВОчередь`,
 * и делает её в обоих исходах.
 */
export async function воротаОтправки(proposalId: string): Promise<РешениеВорот> {
  const { data: предложение } = await базаCare()
    .from('proposals')
    .select('id, case_id, kind, payload, payload_hash, data_version, status')
    .eq('id', proposalId)
    .maybeSingle()

  if (!предложение) return { разрешено: false, причина: 'not_pending', объяснение: 'Предложение не найдено.' }
  if (предложение.status !== 'pending' && предложение.status !== 'accepted') {
    return { разрешено: false, причина: 'not_pending', объяснение: ОБЪЯСНЕНИЕ.not_pending }
  }

  // 1. Рубильник. Сильнее всего остального: пока он выключен, ни флаг, ни
  //    свежесть, ни рабочее время значения не имеют.
  const состояние = await режим()
  if (!состояние.external_sends) {
    return { разрешено: false, причина: 'sends_disabled', объяснение: ОБЪЯСНЕНИЕ.sends_disabled }
  }

  const { data: дело } = await базаCare()
    .from('cases')
    .select('id, client_id')
    .eq('id', предложение.case_id)
    .maybeSingle()
  if (!дело) return { разрешено: false, причина: 'no_recipient', объяснение: 'Дело не найдено.' }

  // 2. Флаг именно этого клиента. Пилот идёт по одному человеку.
  if (!(await флагВключён('outbound', { clientId: дело.client_id }))) {
    return { разрешено: false, причина: 'flag_off', объяснение: ОБЪЯСНЕНИЕ.flag_off }
  }

  // 3. Свежесть. Задача, к которой относится напоминание, лежит в payload —
  //    но пересчитываем мы по делу, а не по тексту.
  const payload = предложение.payload as { task_id?: string }
  const текущая = await версияДанных(предложение.case_id, payload.task_id ?? null)
  if (текущая !== предложение.data_version) {
    await базаCare().from('proposals').update({ status: 'expired' }).eq('id', proposalId)
    return { разрешено: false, причина: 'stale_data', объяснение: ОБЪЯСНЕНИЕ.stale_data }
  }

  // 4. Тихие часы.
  if (await вТихиеЧасы()) {
    return { разрешено: false, причина: 'quiet_hours', объяснение: ОБЪЯСНЕНИЕ.quiet_hours }
  }

  // 5. Получатель — из дела. В payload его нет и не должно быть.
  const { data: контакты } = await базаCare()
    .from('contacts')
    .select('name, tg_chat_id, kind')
    .eq('case_id', предложение.case_id)
    .eq('kind', 'student')
    .not('tg_chat_id', 'is', null)
    .limit(1)

  const получатель = (контакты ?? [])[0]
  if (!получатель?.tg_chat_id) {
    return { разрешено: false, причина: 'no_recipient', объяснение: ОБЪЯСНЕНИЕ.no_recipient }
  }

  return { разрешено: true, chatId: получатель.tg_chat_id as number, имяПолучателя: получатель.name as string }
}

export type ИтогОчереди =
  | { ok: true; outboundId: string }
  | { ok: false; причина: КодОтказа; объяснение: string }

/**
 * Поставить принятое предложение в очередь отправки.
 *
 * Запись создаётся в обоих исходах: при отказе — со статусом `cancelled` и
 * причиной. `unique(proposal_id)` в базе не даёт создать вторую отправку по
 * одному предложению, поэтому повторное нажатие кнопки или второй тик не
 * дадут человеку второго сообщения.
 *
 * Повторить после отказа можно: отменённая запись обновляется, а не
 * дублируется. Иначе включение рубильника не помогло бы уже отклонённым
 * предложениям, и их пришлось бы готовить заново.
 */
export async function поставитьВОчередь(proposalId: string, ктоРешил: string): Promise<ИтогОчереди> {
  const { data: было } = await базаCare()
    .from('outbound_actions')
    .select('id, status')
    .eq('proposal_id', proposalId)
    .maybeSingle()

  // Уже ушло или уже в очереди — второй раз не отправляем ни при каких
  // обстоятельствах. Это то, ради чего стоит unique(proposal_id).
  if (было && (было.status === 'sent' || было.status === 'queued' || было.status === 'unknown')) {
    return { ok: false, причина: 'already_handled', объяснение: ОБЪЯСНЕНИЕ.already_handled }
  }

  const решение = await воротаОтправки(proposalId)

  const { data: предложение } = await базаCare()
    .from('proposals')
    .select('case_id, payload, payload_hash')
    .eq('id', proposalId)
    .maybeSingle()

  const общее = {
    proposal_id: proposalId,
    channel: 'telegram',
    payload: предложение?.payload ?? {},
    payload_hash: предложение?.payload_hash ?? '',
  }

  if (!решение.разрешено) {
    const запись = {
      ...общее,
      recipient: {},
      status: 'cancelled',
      cancel_reason: решение.причина,
    }
    if (было) {
      await базаCare().from('outbound_actions').update(запись).eq('id', было.id)
    } else {
      await базаCare().from('outbound_actions').insert(запись)
    }

    await базаCare().from('events').insert({
      actor_kind: 'member',
      actor_id: ктоРешил,
      case_id: предложение?.case_id ?? null,
      action: 'outbound_refused',
      after: { proposal_id: proposalId, причина: решение.причина },
      source: { gate: 'lib/care/gate/outbound.ts' },
      reason: решение.объяснение,
    })

    return { ok: false, причина: решение.причина, объяснение: решение.объяснение }
  }

  const запись = {
    ...общее,
    // Получатель записывается из решения ворот, а не из payload.
    recipient: { tg_chat_id: решение.chatId, name: решение.имяПолучателя },
    status: 'queued',
    cancel_reason: null,
  }

  const { data: создано, error } = было
    ? await базаCare().from('outbound_actions').update(запись).eq('id', было.id).select('id').single()
    : await базаCare().from('outbound_actions').insert(запись).select('id').single()

  if (error) {
    // 23505 — кто-то успел создать отправку между проверкой и вставкой.
    // Это не ошибка, а именно то, что ограничение должно было предотвратить.
    if (error.code === '23505') {
      return { ok: false, причина: 'already_handled', объяснение: ОБЪЯСНЕНИЕ.already_handled }
    }
    throw new Error(`не удалось поставить в очередь: ${error.message}`)
  }

  await базаCare().from('proposals').update({ status: 'accepted', decided_by: ктоРешил, decided_at: new Date().toISOString() }).eq('id', proposalId)

  await базаCare().from('events').insert({
    actor_kind: 'member',
    actor_id: ктоРешил,
    case_id: предложение?.case_id ?? null,
    action: 'outbound_queued',
    after: { proposal_id: proposalId, outbound_id: создано!.id },
    source: { gate: 'lib/care/gate/outbound.ts' },
    reason: 'предложение принято куратором',
  })

  return { ok: true, outboundId: создано!.id }
}
