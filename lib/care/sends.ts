/**
 * Разрешение писать конкретному клиенту — последняя дверь перед настоящим
 * сообщением.
 *
 * ПОЧЕМУ ОТДЕЛЬНО ОТ РУБИЛЬНИКА КОНТУРА. Их два, и они про разное.
 * `care.env_marker.external_sends` отвечает на вопрос «ходим ли мы наружу
 * вообще» — это предохранитель всего контура, и меняется он только миграцией.
 * Так решено нарочно: рубильник, который переключается нажатием в интерфейсе,
 * однажды переключится по ошибке. Флаг `outbound` отвечает на другой вопрос —
 * «этому человеку уже можно», — и решается он по каждому клиенту отдельно, по
 * мере роста пилота. Такое решение принимают часто, и ему место в кабинете.
 *
 * ПОЧЕМУ ПОКАЗЫВАЕМ ДОСТУПНОСТЬ ГРУППЫ. Включить отправки клиенту, в чью
 * группу бот писать не может, — значит получить ощущение, что всё готово, и
 * выяснить обратное в день, когда напоминание не ушло. Состояние берём из
 * проверки каналов: она спрашивает Телеграм и ничего не отправляет.
 *
 * ПОЧЕМУ ВКЛЮЧЕНИЕ — СОБЫТИЕ. «Кто разрешил писать этому клиенту и когда» —
 * первый вопрос, если сообщение ушло не вовремя или не туда.
 */
import { базаCare } from './db'
import { режим } from './mode'

export type СтрокаОтправок = {
  caseId: string
  clientId: number
  имя: string
  is_synthetic: boolean
  /** Разрешены ли отправки этому клиенту. */
  разрешено: boolean
  /** Можем ли мы вообще писать в его группу. */
  каналДоступен: boolean
  почемуКанал: string | null
}

export type КартинаОтправок = {
  /** Рубильник контура. Пока он выключен, флаги клиентов ничего не меняют. */
  контурОткрыт: boolean
  заметкаКонтура: string | null
  строки: СтрокаОтправок[]
}

type ЗаписьДела = {
  id: string
  client_id: number
  is_synthetic: boolean
  synthetic_name: string | null
}

/** Картина целиком: рубильник, флаги по клиентам, доступность групп. */
export async function картинаОтправок(дела: string[]): Promise<КартинаОтправок> {
  const состояние = await режим()
  if (!дела.length) {
    return { контурОткрыт: состояние.external_sends, заметкаКонтура: состояние.note, строки: [] }
  }

  const { data: записи } = await базаCare()
    .from('cases')
    .select('id, client_id, is_synthetic, synthetic_name')
    .in('id', дела)
    .eq('automation_owner', 'v2')
    .eq('status', 'active')

  const список = (записи ?? []) as ЗаписьДела[]
  if (!список.length) {
    return { контурОткрыт: состояние.external_sends, заметкаКонтура: состояние.note, строки: [] }
  }

  const [{ data: флаги }, { data: каналы }] = await Promise.all([
    базаCare()
      .from('feature_flags')
      .select('scope_id, enabled')
      .eq('flag', 'outbound')
      .eq('scope', 'client'),
    базаCare().from('connections').select('scope, status, last_error').eq('kind', 'telegram'),
  ])

  const поКлиенту = new Map((флаги ?? []).map((ф) => [String(ф.scope_id), ф.enabled === true]))
  const поДелу = new Map<string, { ok: boolean; почему: string | null }>()
  for (const к of каналы ?? []) {
    const caseId = (к.scope as { case_id?: string })?.case_id
    if (caseId) {
      поДелу.set(caseId, { ok: к.status === 'ok', почему: (к.last_error as string | null) ?? null })
    }
  }

  // Имена берём из старой CRM — те же, что видит куратор везде.
  const { клиентыПоId } = await import('./cases')
  const клиенты = await клиентыПоId(список.filter((д) => !д.is_synthetic).map((д) => д.client_id))

  const строки: СтрокаОтправок[] = список.map((д) => {
    const канал = поДелу.get(д.id)
    return {
      caseId: д.id,
      clientId: д.client_id,
      имя: д.is_synthetic
        ? (д.synthetic_name ?? 'тестовое дело')
        : (клиенты.get(д.client_id)?.name ?? `Клиент #${д.client_id}`),
      is_synthetic: д.is_synthetic,
      разрешено: поКлиенту.get(String(д.client_id)) === true,
      // Нет записи о канале — не «доступен»: проверка по этому делу ещё не
      // проходила, и выдавать незнание за готовность нельзя.
      каналДоступен: канал?.ok === true,
      почемуКанал: канал ? канал.почему : 'канал ещё не проверялся',
    }
  })

  return {
    контурОткрыт: состояние.external_sends,
    заметкаКонтура: состояние.note,
    строки: строки.sort((а, б) => а.имя.localeCompare(б.имя, 'ru')),
  }
}

export type ИтогФлага = { ok: true; текст: string } | { ok: false; ошибка: string }

/**
 * Разрешить или запретить отправки клиенту.
 *
 * Включение не проверяет доступность группы и не отказывает по ней: бывает,
 * что группу добавят через час, а решение принимается сейчас. Но сказать об
 * этом обязано — молчаливое «готово» там, где писать некуда, и есть то, из-за
 * чего потом ищут, почему ничего не ушло.
 */
export async function разрешитьОтправки(
  caseId: string,
  включить: boolean,
  участникId: string
): Promise<ИтогФлага> {
  const { data: дело } = await базаCare()
    .from('cases')
    .select('client_id, automation_owner')
    .eq('id', caseId)
    .maybeSingle()

  if (!дело) return { ok: false, ошибка: 'Дела с таким номером нет' }
  if (дело.automation_owner !== 'v2') {
    // На прежнем кабинете автоматика клиента не видит вовсе, и флаг означал бы
    // разрешение, которым некому воспользоваться.
    return { ok: false, ошибка: 'Дело ведёт прежний кабинет — отправки по нему не готовятся' }
  }

  const ключ = String(дело.client_id)
  const { data: было } = await базаCare()
    .from('feature_flags')
    .select('id')
    .eq('flag', 'outbound')
    .eq('scope', 'client')
    .eq('scope_id', ключ)
    .maybeSingle()

  const { error } = было
    ? await базаCare().from('feature_flags').update({ enabled: включить }).eq('id', было.id)
    : await базаCare()
        .from('feature_flags')
        .insert({ scope: 'client', scope_id: ключ, flag: 'outbound', enabled: включить })

  if (error) return { ok: false, ошибка: `Не записалось: ${error.message}` }

  await базаCare().from('events').insert({
    actor_kind: 'member',
    actor_id: участникId,
    case_id: caseId,
    action: включить ? 'outbound_allowed' : 'outbound_revoked',
    after: { client_id: дело.client_id, enabled: включить },
    source: { ui: 'app/care/admin/switch' },
    reason: включить ? 'руководитель разрешил отправки клиенту' : 'руководитель запретил отправки клиенту',
  })

  if (!включить) return { ok: true, текст: 'Запрещено. Напоминания по делу готовятся, но не уходят.' }

  const состояние = await режим()
  const { data: канал } = await базаCare()
    .from('connections')
    .select('status')
    .eq('kind', 'telegram')
    .eq('scope->>case_id', caseId)
    .maybeSingle()

  const оговорки: string[] = []
  if (!состояние.external_sends) {
    оговорки.push('рубильник контура выключен — наружу пока не уходит ничего')
  }
  if (канал?.status !== 'ok') {
    оговорки.push('в группу этого клиента бот писать не может — проверьте, добавлен ли он туда')
  }

  return {
    ok: true,
    текст: оговорки.length
      ? `Разрешено, но ${оговорки.join('; ')}.`
      : 'Разрешено. Утверждённые напоминания по этому клиенту будут уходить.',
  }
}
