/**
 * Чтение дел для экранов кабинета.
 *
 * Каждая функция начинается с области видимости и ею же ограничивается.
 * Ни одна не принимает «покажи все дела» — такого вызова просто нет, и это
 * намеренно: функция, которой можно не передать участника, однажды будет
 * вызвана без него.
 *
 * Имя клиента лежит в рабочей таблице, а дело — в своей схеме, и соединить их
 * запросом нельзя: PostgREST не ходит между схемами. Поэтому два обращения и
 * склейка в коде — по одному на экран, а не по одному на строку.
 */
import { базаCare, базаPublic } from './db'
import { видимыеДела, делоДоступно, type Участник } from './access'

export type ДелоВСписке = {
  id: string
  client_id: number
  intake_year: number
  intake_term: string | null
  status: string
  automation_owner: 'legacy' | 'v2'
  service_scope: string | null
  имяКлиента: string
  страна: string | null
  этапCRM: string | null
  задачОткрыто: number
  ждутКлиента: number
  ближайшийСрок: string | null
}

type ЗаписьДела = {
  id: string
  client_id: number
  intake_year: number
  intake_term: string | null
  status: string
  automation_owner: 'legacy' | 'v2'
  service_scope: string | null
  owner_member_id: string | null
  notes: string | null
  created_at: string
}

/** Имена клиентов одним запросом: по одному на экран, а не на строку. */
async function клиентыПоId(идентификаторы: number[]) {
  if (!идентификаторы.length) return new Map<number, { name: string | null; country: string | null; current_stage_code: string | null }>()
  const { data, error } = await базаPublic()
    .from('clients')
    .select('id, name, country, current_stage_code')
    .in('id', идентификаторы)
  if (error) throw new Error(`не удалось прочитать клиентов: ${error.message}`)
  return new Map((data ?? []).map((к) => [к.id as number, к]))
}

export async function списокДел(участник: Участник): Promise<ДелоВСписке[]> {
  const область = await видимыеДела(участник)
  if (область.пусто) return []

  const { data: дела, error } = await базаCare()
    .from('cases')
    .select('id, client_id, intake_year, intake_term, status, automation_owner, service_scope, owner_member_id, notes, created_at')
    .in('id', область.дела)
    .order('intake_year', { ascending: true })
  if (error) throw new Error(`не удалось прочитать дела: ${error.message}`)

  const список = (дела ?? []) as ЗаписьДела[]
  if (!список.length) return []

  // Задачи всех видимых дел одним запросом — иначе на экране из тридцати
  // строк получилось бы тридцать обращений к базе.
  const { data: задачи } = await базаCare()
    .from('tasks')
    .select('case_id, status, waiting_on, due_on')
    .in('case_id', список.map((д) => д.id))
    .not('status', 'in', '("done","failed")')

  const клиенты = await клиентыПоId(список.map((д) => д.client_id))

  return список.map((д) => {
    const свои = (задачи ?? []).filter((з) => з.case_id === д.id)
    const сроки = свои.map((з) => з.due_on).filter((s): s is string => !!s).sort()
    const клиент = клиенты.get(д.client_id)
    return {
      id: д.id,
      client_id: д.client_id,
      intake_year: д.intake_year,
      intake_term: д.intake_term,
      status: д.status,
      automation_owner: д.automation_owner,
      service_scope: д.service_scope,
      // Клиента может не быть видно, если его удалили в CRM. Показываем номер,
      // а не пустоту: строка без подписи выглядит как ошибка отрисовки.
      имяКлиента: клиент?.name ?? `Клиент #${д.client_id}`,
      страна: клиент?.country ?? null,
      этапCRM: клиент?.current_stage_code ?? null,
      задачОткрыто: свои.length,
      ждутКлиента: свои.filter((з) => з.waiting_on === 'client').length,
      ближайшийСрок: сроки[0] ?? null,
    }
  })
}

export type ПодробностиДела = {
  дело: ЗаписьДела
  имяКлиента: string
  клиент: { name: string | null; country: string | null; email: string | null; phone: string | null; current_stage_code: string | null } | null
  контакты: { id: string; kind: string; name: string; tg_chat_id: number | null; phone: string | null; email: string | null; can_decide: boolean }[]
  факты: { id: string; field: string; value: unknown; unit: string | null; currency: string | null; status: string; is_plan: boolean; quote: string | null; version: number; created_at: string }[]
  задачи: { id: string; title: string; status: string; waiting_on: string; due_on: string | null; next_check_on: string | null }[]
  документы: { id: string; doc_type: string | null; file_name: string | null; status: string | null; uploaded_at: string | null }[]
  сообщений: number
  журнал: { id: string; action: string; actor_kind: string; created_at: string; reason: string | null }[]
}

/**
 * Одно дело со всем, что показывает карточка.
 *
 * `null` означает «нет доступа или нет дела» — намеренно одно и то же
 * значение. Разные ответы на эти два случая рассказали бы постороннему, что
 * дело существует.
 */
export async function подробностиДела(участник: Участник, caseId: string): Promise<ПодробностиДела | null> {
  if (!(await делоДоступно(участник, caseId))) return null

  const { data: дело, error } = await базаCare()
    .from('cases')
    .select('id, client_id, intake_year, intake_term, status, automation_owner, service_scope, owner_member_id, notes, created_at')
    .eq('id', caseId)
    .maybeSingle()
  if (error) throw new Error(`не удалось прочитать дело: ${error.message}`)
  if (!дело) return null

  const запись = дело as ЗаписьДела

  const [контакты, факты, задачи, журнал, клиенты, документы, сообщения] = await Promise.all([
    базаCare().from('contacts').select('id, kind, name, tg_chat_id, phone, email, can_decide').eq('case_id', caseId).order('kind'),
    базаCare().from('facts').select('id, field, value, unit, currency, status, is_plan, quote, version, created_at').eq('case_id', caseId).order('field'),
    базаCare().from('tasks').select('id, title, status, waiting_on, due_on, next_check_on').eq('case_id', caseId).order('due_on', { nullsFirst: false }),
    базаCare().from('events').select('id, action, actor_kind, created_at, reason').eq('case_id', caseId).order('created_at', { ascending: false }).limit(20),
    клиентыПоId([запись.client_id]),
    // Документы читаются из рабочей таблицы как есть: своих мы не заводим до
    // решения владельца по обработке персональных документов (п. 0.7 плана).
    базаPublic().from('client_documents').select('id, doc_type, file_name, status, uploaded_at').eq('client_id', запись.client_id).order('uploaded_at', { nullsFirst: false }),
    базаPublic().from('client_tg_messages').select('id').eq('client_id', запись.client_id),
  ])

  const { data: полныйКлиент } = await базаPublic()
    .from('clients')
    .select('name, country, email, phone, current_stage_code')
    .eq('id', запись.client_id)
    .maybeSingle()

  return {
    дело: запись,
    имяКлиента: клиенты.get(запись.client_id)?.name ?? `Клиент #${запись.client_id}`,
    клиент: полныйКлиент ?? null,
    контакты: (контакты.data ?? []) as ПодробностиДела['контакты'],
    факты: (факты.data ?? []) as ПодробностиДела['факты'],
    задачи: (задачи.data ?? []) as ПодробностиДела['задачи'],
    документы: (документы.data ?? []) as ПодробностиДела['документы'],
    сообщений: (сообщения.data ?? []).length,
    журнал: (журнал.data ?? []) as ПодробностиДела['журнал'],
  }
}

export type СтрокаКоманды = {
  участникId: string
  имя: string
  дел: number
  задачОткрыто: number
  ждутРешения: number
  самоеДолгоеОжиданиеДней: number | null
}

/**
 * Сводка по команде для руководителя.
 *
 * «Самое долгое ожидание» — то, ради чего экран существует: не сколько задач,
 * а сколько времени что-то стоит. Задача, висящая месяц, опаснее десяти
 * свежих, но в обычном счётчике они выглядят одинаково.
 */
export async function сводкаКоманды(руководитель: Участник): Promise<СтрокаКоманды[]> {
  const { data: люди, error } = await базаCare()
    .from('members')
    .select('id, user_id, care_role')
    .or(`team_lead_id.eq.${руководитель.id},id.eq.${руководитель.id}`)
  if (error) throw new Error(`не удалось прочитать команду: ${error.message}`)

  const участники = (люди ?? []) as { id: string; user_id: string; care_role: string }[]
  if (!участники.length) return []

  const [{ data: дела }, { data: пользователи }] = await Promise.all([
    базаCare().from('cases').select('id, owner_member_id').in('owner_member_id', участники.map((ч) => ч.id)),
    базаPublic().from('users').select('id, name').in('id', участники.map((ч) => ч.user_id)),
  ])

  const имена = new Map((пользователи ?? []).map((п) => [п.id as string, (п.name as string | null) ?? null]))
  const всеДела = (дела ?? []) as { id: string; owner_member_id: string }[]

  const { data: задачи } = всеДела.length
    ? await базаCare()
        .from('tasks')
        .select('case_id, status, waiting_on, updated_at')
        .in('case_id', всеДела.map((д) => д.id))
        .not('status', 'in', '("done","failed")')
    : { data: [] as { case_id: string; status: string; waiting_on: string; updated_at: string }[] }

  const сейчас = Date.now()

  return участники.map((ч) => {
    const свои = всеДела.filter((д) => д.owner_member_id === ч.id)
    const идентификаторы = new Set(свои.map((д) => д.id))
    const ихЗадачи = (задачи ?? []).filter((з) => идентификаторы.has(з.case_id))
    const ожидания = ихЗадачи
      .filter((з) => з.waiting_on !== 'none')
      .map((з) => Math.floor((сейчас - new Date(з.updated_at).getTime()) / 86_400_000))
      .sort((а, б) => б - а)

    return {
      участникId: ч.id,
      имя: имена.get(ч.user_id) ?? 'без имени',
      дел: свои.length,
      задачОткрыто: ихЗадачи.length,
      ждутРешения: ихЗадачи.filter((з) => з.waiting_on === 'review').length,
      самоеДолгоеОжиданиеДней: ожидания[0] ?? null,
    }
  })
}
