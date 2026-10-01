/**
 * Можем ли мы написать этому клиенту — проверка без единого сообщения.
 *
 * ЗАЧЕМ. Напоминание уходит в группу Телеграма. Бота могли из неё удалить,
 * группу переделать в канал, права урезать — и узнать об этом в момент отправки
 * значит узнать слишком поздно: сообщение со сроком не уйдёт, а заметно станет,
 * когда срок пройдёт.
 *
 * ПОЧЕМУ НЕ ПРОБНЫМ СООБЩЕНИЕМ. Пробное сообщение — это сообщение клиенту. Два
 * запроса Bot API отвечают на тот же вопрос, ничего не отправляя: `getChat`
 * говорит, существует ли чат и какого он вида, `getChatMember` — состоит ли там
 * бот и что ему позволено.
 *
 * ЧТО ЗАПИСЫВАЕТСЯ. Строка состояния на чат в `care.connections`: `ok` —
 * писать можем, `down` — не можем, и почему. Таблица для этого и заведена, но
 * до сих пор в неё никто не писал, и «нет записей» читалось как «каналов нет».
 *
 * ЧЕГО ЗДЕСЬ НЕТ. Любой записи наружу. Это чтение состояния, и всё, что оно
 * производит, — строки для человека.
 */
import { базаCare } from './db'
import { необязательна } from './env'

const ТАЙМАУТ_МС = 10_000

/** Вид чата, в который можно писать от имени бота. */
const ПИШЕМ_В = ['group', 'supergroup', 'private']

export type СостояниеЧата = {
  caseId: string
  chatId: number
  название: string | null
  можемПисать: boolean
  почему: string | null
}

export type ИтогПроверкиКаналов = {
  проверено: number
  доступны: number
  недоступны: number
  безЧата: number
  строки: СостояниеЧата[]
  причины: string[]
}

type ОтветTG<T> = { ok: boolean; result?: T; description?: string }

async function спроситьTG<T>(токен: string, метод: string, тело: unknown): Promise<ОтветTG<T>> {
  try {
    const ответ = await fetch(`https://api.telegram.org/bot${токен}/${метод}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(тело),
      signal: AbortSignal.timeout(ТАЙМАУТ_МС),
    })
    return (await ответ.json()) as ОтветTG<T>
  } catch (e) {
    // Нет ответа — это не «нельзя писать», это «не знаем». Разница важна:
    // по первому дело пометили бы сломанным, по второму — оставили как было.
    return { ok: false, description: `сеть: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/**
 * Разобрать ответы Телеграма в один понятный вывод.
 *
 * Вынесено отдельно, чтобы проверять без сети: ответы Bot API известны и
 * воспроизводятся строкой, а гонять ради них настоящие запросы — платить
 * временем за то же самое.
 */
export function выводОЧате(
  чат: ОтветTG<{ id: number; type: string; title?: string }>,
  участник: ОтветTG<{ status: string; can_send_messages?: boolean }>
): { можемПисать: boolean; почему: string | null; название: string | null } {
  if (!чат.ok) {
    return { можемПисать: false, почему: чат.description ?? 'чат не отвечает', название: null }
  }

  const название = чат.result?.title ?? null
  const вид = чат.result?.type ?? ''
  if (!ПИШЕМ_В.includes(вид)) {
    return { можемПисать: false, почему: `чат стал «${вид}» — писать туда нельзя`, название }
  }

  if (!участник.ok) {
    return { можемПисать: false, почему: участник.description ?? 'бота в чате нет', название }
  }

  const статус = участник.result?.status ?? ''
  if (статус === 'left' || статус === 'kicked') {
    return { можемПисать: false, почему: 'бота удалили из группы', название }
  }
  // `can_send_messages` приходит только у ограниченных участников; у обычных и
  // администраторов его нет вовсе, и отсутствие здесь означает «не ограничен».
  if (статус === 'restricted' && участник.result?.can_send_messages === false) {
    return { можемПисать: false, почему: 'боту запрещено писать в группе', название }
  }

  return { можемПисать: true, почему: null, название }
}

/**
 * Проверить один чат. Нужен чек-листу перевода на новый кабинет: план требует
 * там именно `getChatMember`, а не «поле заполнено».
 */
export async function проверитьЧат(
  chatId: number
): Promise<{ можемПисать: boolean; почему: string | null; название: string | null }> {
  const токен = необязательна('CARE_TELEGRAM_BOT_TOKEN')
  if (!токен) {
    return { можемПисать: false, почему: 'CARE_TELEGRAM_BOT_TOKEN не задан', название: null }
  }

  const я = await спроситьTG<{ id: number }>(токен, 'getMe', {})
  if (!я.ok) return { можемПисать: false, почему: `бот не отвечает: ${я.description}`, название: null }

  const [чат, участник] = await Promise.all([
    спроситьTG<{ id: number; type: string; title?: string }>(токен, 'getChat', { chat_id: chatId }),
    спроситьTG<{ status: string; can_send_messages?: boolean }>(токен, 'getChatMember', {
      chat_id: chatId,
      user_id: я.result!.id,
    }),
  ])

  return выводОЧате(чат, участник)
}

/** Проверить все привязанные чаты дел нового кабинета. */
export async function проверитьКаналы(): Promise<ИтогПроверкиКаналов> {
  const итог: ИтогПроверкиКаналов = {
    проверено: 0,
    доступны: 0,
    недоступны: 0,
    безЧата: 0,
    строки: [],
    причины: [],
  }

  const токен = необязательна('CARE_TELEGRAM_BOT_TOKEN')
  if (!токен) {
    итог.причины.push('CARE_TELEGRAM_BOT_TOKEN не задан — проверять нечем')
    return итог
  }

  const { data: дела } = await базаCare()
    .from('cases')
    .select('id')
    .eq('automation_owner', 'v2')
    .eq('status', 'active')

  const номера = (дела ?? []).map((д) => д.id as string)
  if (!номера.length) {
    итог.причины.push('дел на новом кабинете нет')
    return итог
  }

  const { data: контакты } = await базаCare()
    .from('contacts')
    .select('case_id, tg_chat_id')
    .in('case_id', номера)
    .not('tg_chat_id', 'is', null)

  const поДелу = new Map<string, number>()
  for (const к of контакты ?? []) {
    if (!поДелу.has(к.case_id as string)) поДелу.set(к.case_id as string, Number(к.tg_chat_id))
  }

  итог.безЧата = номера.filter((id) => !поДелу.has(id)).length

  const я = await спроситьTG<{ id: number }>(токен, 'getMe', {})
  if (!я.ok) {
    итог.причины.push(`бот не отвечает: ${я.description ?? 'неизвестно'}`)
    return итог
  }
  const мойId = я.result!.id

  for (const [caseId, chatId] of поДелу) {
    const чат = await спроситьTG<{ id: number; type: string; title?: string }>(токен, 'getChat', {
      chat_id: chatId,
    })
    const участник = await спроситьTG<{ status: string; can_send_messages?: boolean }>(
      токен,
      'getChatMember',
      { chat_id: chatId, user_id: мойId }
    )

    const вывод = выводОЧате(чат, участник)
    итог.проверено += 1
    if (вывод.можемПисать) итог.доступны += 1
    else {
      итог.недоступны += 1
      итог.причины.push(`${вывод.название ?? chatId}: ${вывод.почему}`)
    }

    итог.строки.push({ caseId, chatId, ...вывод })

    const записано = await записатьСостояние(caseId, chatId, вывод)
    // Молча не записать — худший исход: проверка «прошла», лента внимания
    // ничего не показала, и все уверены, что писать можно.
    if (записано) итог.причины.push(`${chatId}: состояние не записалось — ${записано}`)
  }

  return итог
}

/**
 * Записать состояние одного чата.
 *
 * Выбор-потом-запись, а не `upsert`: ключ стоит на выражении
 * `scope ->> 'chat_id'`, и `onConflict` по выражению PostgREST не принимает —
 * первая версия молча не записала ни одной строки, а проверка при этом
 * отрапортовала об успехе.
 *
 * Возвращает текст ошибки или `null`.
 */
async function записатьСостояние(
  caseId: string,
  chatId: number,
  вывод: { можемПисать: boolean; почему: string | null; название: string | null }
): Promise<string | null> {
  const поле = {
    kind: 'telegram' as const,
    scope: { case_id: caseId, chat_id: String(chatId), title: вывод.название },
    status: вывод.можемПисать ? ('ok' as const) : ('down' as const),
    last_ok_at: вывод.можемПисать ? new Date().toISOString() : null,
    last_error: вывод.почему,
    updated_at: new Date().toISOString(),
  }

  const { data: было } = await базаCare()
    .from('connections')
    .select('id')
    .eq('kind', 'telegram')
    .eq('scope->>chat_id', String(chatId))
    .maybeSingle()

  const { error } = было
    ? await базаCare().from('connections').update(поле).eq('id', было.id)
    : await базаCare().from('connections').insert(поле)

  return error ? error.message : null
}

/** Дела, в чьи чаты писать нельзя, — для ленты внимания. */
export async function чатыНедоступны(дела: string[]): Promise<Map<string, string>> {
  if (!дела.length) return new Map()

  const { data } = await базаCare()
    .from('connections')
    .select('scope, status, last_error')
    .eq('kind', 'telegram')
    .eq('status', 'down')

  const по = new Map<string, string>()
  for (const с of data ?? []) {
    const caseId = (с.scope as { case_id?: string })?.case_id
    if (caseId && дела.includes(caseId)) {
      по.set(caseId, (с.last_error as string | null) ?? 'писать в группу нельзя')
    }
  }
  return по
}
