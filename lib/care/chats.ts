/**
 * Группы, которые знает care-бот, и привязка их к делам.
 *
 * ЗАЧЕМ. Проверка 02.10.2026 показала, что бот не состоит ни в одной группе
 * клиентов: он отдельный от прежнего, и добавлять его надо заново. Значит
 * ближайшее, что будет делать команда, — добавлять бота в группы. После этого
 * группу надо связать с делом, иначе кабинет её не видит: ни переписки, ни
 * адреса для напоминания.
 *
 * ДО СИХ ПОР ЭТО ДЕЛАЛ ТЕРМИНАЛ. `link-chats.ts` ищет группу по имени и
 * фамилии клиента в названии. Это работает, пока названия аккуратные, и молча
 * не работает, когда нет. Здесь иначе: куратор видит группы, в которые бота
 * добавили, и говорит, какая чья.
 *
 * ДВЕ ПРИВЯЗКИ, А НЕ ОДНА. Читать переписку и писать в неё — разные пути:
 * чтение идёт через `care.sources(kind='message', ref.chat_id)`, отправка —
 * через `contacts.tg_chat_id`. Привязка делает оба сразу: одна без другой даёт
 * дело, где переписка видна, а написать нельзя (или наоборот), и разбираться в
 * этом придётся в день, когда у клиента прошёл срок.
 *
 * ЧЕГО ЗДЕСЬ НЕТ. Угадывания. Группа привязывается к делу только по прямому
 * указанию человека: ошибка здесь — это напоминание чужому клиенту, а такое не
 * отменяется.
 */
import { базаCare } from './db'

export type ЗнакомаяГруппа = {
  chatId: string
  название: string | null
  /** Когда бот последний раз видел в ней что-либо. */
  когда: string
  /** Дело, к которому она уже привязана, если привязана. */
  занятаДелом: string | null
}

type Событие = {
  payload: Record<string, unknown>
  received_at: string
}

/** Вытащить чат из обновления Telegram, каким бы оно ни было. */
function чатИзСобытия(payload: Record<string, unknown>): { id: string; title: string | null } | null {
  for (const ключ of ['message', 'my_chat_member', 'edited_message', 'channel_post']) {
    const узел = payload[ключ] as { chat?: { id?: number; title?: string; type?: string } } | undefined
    const чат = узел?.chat
    if (чат?.id === undefined) continue
    // Личные переписки сюда не берём: напоминания уходят в группу клиента, а
    // привязать дело к личке сотрудника — верный способ написать не туда.
    if (чат.type === 'private') continue
    return { id: String(чат.id), title: чат.title ?? null }
  }
  return null
}

/**
 * Группы, которые бот знает, с пометкой «уже чья-то».
 *
 * Занятые не прячем: «эта группа у Иванова» — ответ на вопрос куратора, а
 * пустой список на него не отвечает.
 */
export async function знакомыеГруппы(): Promise<ЗнакомаяГруппа[]> {
  const { data: события } = await базаCare()
    .from('inbound_events')
    .select('payload, received_at')
    .eq('channel', 'telegram')
    .order('received_at', { ascending: false })
    .limit(500)

  const поЧату = new Map<string, ЗнакомаяГруппа>()
  for (const с of (события ?? []) as Событие[]) {
    const чат = чатИзСобытия(с.payload ?? {})
    if (!чат) continue
    const было = поЧату.get(чат.id)
    if (было) {
      // Название берём самое свежее непустое: группы переименовывают.
      if (!было.название && чат.title) было.название = чат.title
      continue
    }
    поЧату.set(чат.id, {
      chatId: чат.id,
      название: чат.title,
      когда: с.received_at,
      занятаДелом: null,
    })
  }

  if (!поЧату.size) return []

  const { data: контакты } = await базаCare()
    .from('contacts')
    .select('case_id, tg_chat_id')
    .not('tg_chat_id', 'is', null)

  for (const к of контакты ?? []) {
    const строка = поЧату.get(String(к.tg_chat_id))
    if (строка) строка.занятаДелом = к.case_id as string
  }

  return [...поЧату.values()].sort((а, б) => б.когда.localeCompare(а.когда))
}

export type ИтогПривязки = { ok: true; текст: string } | { ok: false; ошибка: string }

/**
 * Привязать группу к делу.
 *
 * Отказывает, если группа уже чья-то: одна группа на два дела — это чужое
 * напоминание в чужом чате, и отменить его нечем.
 */
export async function привязатьГруппу(
  caseId: string,
  chatId: string,
  участникId: string
): Promise<ИтогПривязки> {
  const номер = Number(chatId)
  if (!Number.isFinite(номер)) return { ok: false, ошибка: 'Номер чата непонятен' }

  const { data: занято } = await базаCare()
    .from('contacts')
    .select('case_id')
    .eq('tg_chat_id', номер)
    .limit(1)

  const чужое = (занято ?? [])[0]
  if (чужое && чужое.case_id !== caseId) {
    return { ok: false, ошибка: 'Эта группа уже привязана к другому делу' }
  }

  const группы = await знакомыеГруппы()
  const группа = группы.find((г) => г.chatId === chatId)
  // Привязываем только то, что бот действительно видел: иначе набранный
  // руками номер уведёт напоминание неизвестно куда.
  if (!группа) {
    return {
      ok: false,
      ошибка: 'Бот такой группы не знает. Добавьте @goandstudy_care_bot в неё и напишите там что-нибудь',
    }
  }

  const { data: контакт } = await базаCare()
    .from('contacts')
    .select('id')
    .eq('case_id', caseId)
    .eq('kind', 'student')
    .limit(1)
    .maybeSingle()

  if (контакт) {
    const { error } = await базаCare()
      .from('contacts')
      .update({ tg_chat_id: номер })
      .eq('id', контакт.id)
    if (error) return { ok: false, ошибка: `Не привязалось: ${error.message}` }
  } else {
    const { error } = await базаCare().from('contacts').insert({
      case_id: caseId,
      kind: 'student',
      name: группа.название ?? 'студент',
      tg_chat_id: номер,
      can_decide: true,
    })
    if (error) return { ok: false, ошибка: `Не завёлся контакт: ${error.message}` }
  }

  // Вторая половина: без источника переписка в кабинете не видна, даже когда
  // адрес для отправки уже есть.
  const { data: источник } = await базаCare()
    .from('sources')
    .select('id')
    .eq('case_id', caseId)
    .eq('kind', 'message')
    .contains('ref', { chat_id: chatId })
    .limit(1)
    .maybeSingle()

  if (!источник) {
    await базаCare().from('sources').insert({
      case_id: caseId,
      kind: 'message',
      ref: { kind: 'telegram_group', chat_id: chatId, title: группа.название },
      note: 'группа привязана из кабинета',
    })
  }

  await базаCare().from('events').insert({
    actor_kind: 'member',
    actor_id: участникId,
    case_id: caseId,
    action: 'chat_linked',
    after: { chat_id: chatId, title: группа.название },
    source: { ui: 'app/care/cases/[id]' },
    reason: 'куратор привязал группу к делу',
  })

  return {
    ok: true,
    текст: `Привязано: «${группа.название ?? chatId}». Переписка станет видна, напоминания пойдут туда.`,
  }
}

/** Отвязать группу — когда привязали не ту. */
export async function отвязатьГруппу(caseId: string, участникId: string): Promise<ИтогПривязки> {
  const { data: контакты } = await базаCare()
    .from('contacts')
    .select('id, tg_chat_id')
    .eq('case_id', caseId)
    .not('tg_chat_id', 'is', null)

  if (!(контакты ?? []).length) return { ok: false, ошибка: 'К делу не привязана ни одна группа' }

  for (const к of контакты ?? []) {
    await базаCare().from('contacts').update({ tg_chat_id: null }).eq('id', к.id)
  }

  await базаCare().from('events').insert({
    actor_kind: 'member',
    actor_id: участникId,
    case_id: caseId,
    action: 'chat_unlinked',
    before: { chat_id: (контакты ?? [])[0]?.tg_chat_id },
    source: { ui: 'app/care/cases/[id]' },
    reason: 'куратор отвязал группу',
  })

  // Источник оставляем: по нему видна прошлая переписка, и стирать её
  // из-за ошибки привязки незачем — писать по нему всё равно нельзя.
  return { ok: true, текст: 'Отвязано. Напоминания по делу больше никуда не пойдут.' }
}
