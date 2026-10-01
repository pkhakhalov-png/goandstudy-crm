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
import { склонение, подписьОжидания, срок } from './labels'

export type ДелоВСписке = {
  id: string
  client_id: number
  intake_year: number
  intake_term: string | null
  status: string
  automation_owner: 'legacy' | 'v2'
  service_scope: string | null
  is_synthetic: boolean
  имяКлиента: string
  этапCRM: string | null
  задачОткрыто: number
  ждутКлиента: number
  ближайшийСрок: string | null
  /** Что происходит с делом сейчас — одной фразой, как в макете. */
  сейчас: string
  /** Что делать дальше — одной фразой с числом или датой. */
  следующийШаг: string
  требуетВнимания: boolean
  страна: string | null
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
  is_synthetic: boolean
  synthetic_name: string | null
}

/** Имена клиентов одним запросом: по одному на экран, а не на строку. */
export async function клиентыПоId(идентификаторы: number[]) {
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
    .select('id, client_id, intake_year, intake_term, status, automation_owner, service_scope, owner_member_id, notes, created_at, is_synthetic, synthetic_name')
    .in('id', область.дела)
  if (error) throw new Error(`не удалось прочитать дела: ${error.message}`)

  const список = (дела ?? []) as ЗаписьДела[]
  if (!список.length) return []

  // Задачи всех видимых дел одним запросом — иначе на экране из тридцати
  // строк получилось бы тридцать обращений к базе.
  const { data: задачи } = await базаCare()
    .from('tasks')
    .select('case_id, title, status, waiting_on, due_on, updated_at')
    .in('case_id', список.map((д) => д.id))
    .not('status', 'in', '("done","failed")')

  // У синтетических дел клиента в рабочей таблице нет и быть не должно:
  // имя лежит в самом деле. Спрашивать про них public.clients значит искать
  // заведомо отсутствующее.
  const клиенты = await клиентыПоId(список.filter((д) => !д.is_synthetic).map((д) => д.client_id))

  const строки = список.map((д) => {
    const свои = (задачи ?? []).filter((з) => з.case_id === д.id)
    const сроки = свои.map((з) => з.due_on).filter((s): s is string => !!s).sort()
    const клиент = клиенты.get(д.client_id)

    // «Сейчас» и «следующий шаг» — то, что куратор ищет в списке глазами.
    // Статус задачи (`todo`, `waiting`) на этот вопрос не отвечает: он про
    // состояние записи, а не про состояние дела.
    const ждут = свои.filter((з) => з.waiting_on !== 'none')
    const ближайшая = свои
      .filter((з) => з.due_on)
      .sort((а, б) => (а.due_on ?? '').localeCompare(б.due_on ?? ''))[0]

    const сейчас = свои.length === 0
      ? 'Задач нет'
      : ждут.length > 0
        ? подписьОжидания(ждут[0].waiting_on)
        : 'В работе'

    const следующийШаг = ближайшая
      ? `${ближайшая.title} · ${срок(ближайшая.due_on).текст}`
      : свои.length > 0
        ? свои[0].title
        : 'Завести первую задачу'

    return {
      id: д.id,
      client_id: д.client_id,
      intake_year: д.intake_year,
      intake_term: д.intake_term,
      status: д.status,
      automation_owner: д.automation_owner,
      service_scope: д.service_scope,
      is_synthetic: д.is_synthetic,
      // Клиента может не быть видно, если его удалили в CRM. Показываем номер,
      // а не пустоту: строка без подписи выглядит как ошибка отрисовки.
      имяКлиента: д.is_synthetic ? (д.synthetic_name ?? 'тестовое дело') : (клиент?.name ?? `Клиент #${д.client_id}`),
      страна: клиент?.country ?? null,
      этапCRM: клиент?.current_stage_code ?? null,
      задачОткрыто: свои.length,
      ждутКлиента: свои.filter((з) => з.waiting_on === 'client').length,
      ближайшийСрок: сроки[0] ?? null,
      сейчас,
      следующийШаг,
      требуетВнимания:
        свои.some((з) => з.due_on && з.due_on < new Date().toISOString().slice(0, 10)) ||
        свои.some((з) => з.waiting_on === 'review'),
    }
  })

  // Порядок: сверху то, что горит.
  //
  // Первая версия сортировала по году набора, и дело, просроченное на девять
  // дней, оказывалось третьей строкой посреди списка. Куратор открывает этот
  // экран, чтобы понять, за что хвататься, — значит порядок обязан отвечать
  // именно на этот вопрос, а не на «когда человек поступает».
  //
  // Дела без срока уходят вниз, но не исчезают: у них может не быть задач
  // вовсе, и это само по себе повод заглянуть — просто не сегодня.
  return строки.sort((а, б) => {
    if (а.ближайшийСрок && б.ближайшийСрок) {
      return а.ближайшийСрок.localeCompare(б.ближайшийСрок)
    }
    if (а.ближайшийСрок) return -1
    if (б.ближайшийСрок) return 1
    // У обоих сроков нет — вперёд то, где больше открытых задач: там работа
    // хотя бы началась, а дело с нулём задач ждёт, когда его заведут.
    return б.задачОткрыто - а.задачОткрыто
  })
}

export type ПодробностиДела = {
  дело: ЗаписьДела
  имяКлиента: string
  клиент: { name: string | null; country: string | null; email: string | null; phone: string | null; current_stage_code: string | null } | null
  контакты: { id: string; kind: string; name: string; tg_chat_id: number | null; phone: string | null; email: string | null; can_decide: boolean }[]
  факты: { id: string; field: string; value: unknown; unit: string | null; currency: string | null; status: string; is_plan: boolean; quote: string | null; version: number; created_at: string }[]
  задачи: { id: string; title: string; details: string | null; status: string; waiting_on: string; due_on: string | null; next_check_on: string | null }[]
  заявки: { id: string; program_ref: Record<string, unknown>; status: string; note: string | null }[]
  документы: { id: string; doc_type: string | null; file_name: string | null; status: string | null; uploaded_at: string | null }[]
  сообщений: number
  источники: { id: string; kind: string; ref: Record<string, unknown>; note: string | null; captured_at: string; available: boolean }[]
  журнал: { id: string; action: string; actor_kind: string; created_at: string; reason: string | null }[]
  /** Последняя собранная подборка программ, если она есть. */
  подборка: {
    id: string
    version: number
    status: string
    created_at: string
    /** Секрет в адресе страницы для клиента. Пусто — страница не опубликована. */
    share_token: string | null
    строки: {
      id: string
      program_ref: Record<string, unknown>
      tuition_amount: number | null
      currency: string | null
      fit_notes: Record<string, unknown>
      unresolved: string[]
      status: string
      removed_reason: string | null
    }[]
  } | null
  /** Последняя написанная стратегия — предложение, ждущее решения. */
  стратегия: { id: string; текст: string; status: string; created_at: string } | null
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
    .select('id, client_id, intake_year, intake_term, status, automation_owner, service_scope, owner_member_id, notes, created_at, is_synthetic, synthetic_name')
    .eq('id', caseId)
    .maybeSingle()
  if (error) throw new Error(`не удалось прочитать дело: ${error.message}`)
  if (!дело) return null

  const запись = дело as ЗаписьДела

  const [контакты, факты, задачи, журнал, клиенты, документы, сообщения, источники, заявки] = await Promise.all([
    базаCare().from('contacts').select('id, kind, name, tg_chat_id, phone, email, can_decide').eq('case_id', caseId).order('kind'),
    базаCare().from('facts').select('id, field, value, unit, currency, status, is_plan, quote, version, created_at').eq('case_id', caseId).order('field'),
    базаCare().from('tasks').select('id, title, details, status, waiting_on, due_on, next_check_on').eq('case_id', caseId).order('due_on', { nullsFirst: false }),
    базаCare().from('events').select('id, action, actor_kind, created_at, reason').eq('case_id', caseId).order('created_at', { ascending: false }).limit(20),
    запись.is_synthetic ? Promise.resolve(new Map()) : клиентыПоId([запись.client_id]),
    // Документы читаются из рабочей таблицы как есть: своих мы не заводим до
    // решения владельца по обработке персональных документов (п. 0.7 плана).
    // Синтетика в рабочих таблицах не ищется: там её нет по построению.
    запись.is_synthetic
      ? Promise.resolve({ data: [] })
      : базаPublic().from('client_documents').select('id, doc_type, file_name, status, uploaded_at').eq('client_id', запись.client_id).order('uploaded_at', { nullsFirst: false }),
    запись.is_synthetic
      ? Promise.resolve({ data: [] })
      : базаPublic().from('client_tg_messages').select('id').eq('client_id', запись.client_id),
    базаCare()
      .from('sources')
      .select('id, kind, ref, note, captured_at, available')
      .eq('case_id', caseId)
      .order('captured_at', { ascending: false }),
    базаCare()
      .from('applications')
      .select('id, program_ref, status, note')
      .eq('case_id', caseId)
      .order('created_at'),
  ])

  const { data: полныйКлиент } = запись.is_synthetic
    ? { data: null }
    : await базаPublic()
        .from('clients')
        .select('name, country, email, phone, current_stage_code')
        .eq('id', запись.client_id)
        .maybeSingle()

  return {
    дело: запись,
    имяКлиента: запись.is_synthetic
      ? (запись.synthetic_name ?? 'тестовое дело')
      : (клиенты.get(запись.client_id)?.name ?? `Клиент #${запись.client_id}`),
    клиент: полныйКлиент ?? null,
    контакты: (контакты.data ?? []) as ПодробностиДела['контакты'],
    факты: (факты.data ?? []) as ПодробностиДела['факты'],
    задачи: (задачи.data ?? []) as ПодробностиДела['задачи'],
    документы: (документы.data ?? []) as ПодробностиДела['документы'],
    сообщений: (сообщения.data ?? []).length,
    источники: (источники.data ?? []) as ПодробностиДела['источники'],
    заявки: (заявки.data ?? []) as ПодробностиДела['заявки'],
    журнал: (журнал.data ?? []) as ПодробностиДела['журнал'],
    подборка: await последняяПодборка(caseId),
    стратегия: await последняяСтратегия(caseId),
  }
}

/**
 * Последняя подборка со своими строками.
 *
 * Только последняя: прежние версии никуда не деваются, но карточка — это
 * «что сейчас», а не архив. История подборок понадобится, когда куратор
 * начнёт их сравнивать, и тогда это будет отдельный экран.
 */
async function последняяПодборка(caseId: string): Promise<ПодробностиДела['подборка']> {
  const { data: подборки } = await базаCare()
    .from('shortlists')
    .select('id, version, status, created_at, share_token')
    .eq('case_id', caseId)
    .order('version', { ascending: false })
    .limit(1)

  const подборка = (подборки ?? [])[0]
  if (!подборка) return null

  const { data: строки } = await базаCare()
    .from('shortlist_items')
    .select('id, program_ref, tuition_amount, currency, fit_notes, unresolved, status, removed_reason')
    .eq('shortlist_id', подборка.id)
    .order('position')

  return {
    id: подборка.id as string,
    version: подборка.version as number,
    status: подборка.status as string,
    created_at: подборка.created_at as string,
    share_token: (подборка.share_token as string | null) ?? null,
    строки: (строки ?? []) as NonNullable<ПодробностиДела['подборка']>['строки'],
  }
}

/** Последняя стратегия — предложение, которое ещё ждёт решения куратора. */
async function последняяСтратегия(caseId: string): Promise<ПодробностиДела['стратегия']> {
  const { data } = await базаCare()
    .from('proposals')
    .select('id, payload, status, created_at')
    .eq('case_id', caseId)
    .eq('kind', 'other')
    .order('created_at', { ascending: false })
    .limit(1)

  const п = (data ?? [])[0]
  const payload = (п?.payload ?? {}) as { вид?: string; текст?: string }
  if (!п || payload.вид !== 'strategy') return null

  return {
    id: п.id as string,
    текст: payload.текст ?? '',
    status: п.status as string,
    created_at: п.created_at as string,
  }
}

/** Подборка на проверке — одна карточка очереди. */
export type ПодборкаНаПроверку = {
  id: string
  caseId: string
  имяКлиента: string
  контекст: string
  is_synthetic: boolean
  version: number
  собрана: string
  строки: {
    id: string
    вуз: string
    программа: string
    город: string | null
    страна: string | null
    ссылка: string | null
    стоимость: string | null
    почему: string
    проверено: { вид: string; значение: string; цитата: string }[]
    сверка: { вид: string; вывод: string; объяснение: string }[]
    unresolved: string[]
  }[]
}

/**
 * Очередь подборок, ждущих решения куратора.
 *
 * Та же мысль, что у напоминаний и фактов: однородная работа проверяется
 * подряд, а не через открытие двадцати карточек. Подборка на клиента одна,
 * и без очереди куратор про неё просто забудет — она не напоминает о себе
 * сроком, как задача.
 */
export async function очередьПодборок(участник: Участник): Promise<ПодборкаНаПроверку[]> {
  const область = await видимыеДела(участник)
  if (область.пусто) return []

  const { data: подборки, error } = await базаCare()
    .from('shortlists')
    .select('id, case_id, version, created_at')
    .in('case_id', область.дела)
    .eq('status', 'curator_review')
    .order('created_at', { ascending: true })
  if (error) throw new Error(`не удалось прочитать очередь подборок: ${error.message}`)
  if (!подборки?.length) return []

  const { data: строки } = await базаCare()
    .from('shortlist_items')
    .select('id, shortlist_id, program_ref, tuition_amount, currency, fit_notes, unresolved, position')
    .in('shortlist_id', подборки.map((п) => п.id))
    .order('position')

  const { data: дела } = await базаCare()
    .from('cases')
    .select('id, client_id, intake_year, service_scope, is_synthetic, synthetic_name')
    .in('id', подборки.map((п) => п.case_id))

  const список = (дела ?? []) as ЗаписьДела[]
  const клиенты = await клиентыПоId(список.filter((д) => !д.is_synthetic).map((д) => д.client_id))

  return подборки.map((п) => {
    const дело = список.find((д) => д.id === п.case_id)
    const клиент = дело && !дело.is_synthetic ? клиенты.get(дело.client_id) : null

    return {
      id: п.id as string,
      caseId: п.case_id as string,
      имяКлиента: дело?.is_synthetic
        ? (дело.synthetic_name ?? 'тестовое дело')
        : (клиент?.name ?? `Клиент #${дело?.client_id ?? '?'}`),
      контекст: [клиент?.country, дело?.service_scope, дело?.intake_year ? `набор ${дело.intake_year}` : null]
        .filter(Boolean)
        .join(' · '),
      is_synthetic: дело?.is_synthetic ?? false,
      version: п.version as number,
      собрана: п.created_at as string,
      строки: (строки ?? [])
        .filter((с) => с.shortlist_id === п.id)
        .map((с) => {
          const ref = (с.program_ref ?? {}) as Record<string, string>
          const заметки = (с.fit_notes ?? {}) as {
            почему?: string
            проверено?: { вид: string; значение: string; цитата: string }[]
            сверка?: { вид: string; вывод: string; объяснение: string }[]
          }
          return {
            id: с.id as string,
            вуз: ref.вуз ?? '',
            программа: ref.программа ?? '',
            город: ref.город ?? null,
            страна: ref.страна ?? null,
            ссылка: ref.ссылка ?? null,
            стоимость: с.tuition_amount ? `${с.tuition_amount} ${с.currency ?? ''}`.trim() : null,
            почему: заметки.почему ?? '',
            проверено: заметки.проверено ?? [],
            сверка: заметки.сверка ?? [],
            unresolved: (с.unresolved ?? []) as string[],
          }
        }),
    }
  })
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

/**
 * Кому можно передать дело.
 *
 * Не «все сотрудники контура». Список ограничен своей командой: руководитель
 * и те, у кого тот же руководитель, плюс подчинённые — если спрашивает сам
 * руководитель. Полный список персонала в выпадающем меню — это мелкая, но
 * настоящая утечка: кто где работает и сколько их.
 *
 * Отключённые не показываются: передать дело тому, кто больше не работает,
 * — способ потерять дело молча.
 */
export async function коллегиДляПередачи(
  участник: Участник
): Promise<{ id: string; имя: string }[]> {
  const условия: string[] = [`id.eq.${участник.id}`]
  if (участник.team_lead_id) {
    условия.push(`team_lead_id.eq.${участник.team_lead_id}`, `id.eq.${участник.team_lead_id}`)
  }
  if (участник.care_role === 'lead') {
    условия.push(`team_lead_id.eq.${участник.id}`)
  }

  const { data, error } = await базаCare()
    .from('members')
    .select('id, user_id, active')
    .or(условия.join(','))
    .eq('active', true)
  if (error) throw new Error(`не удалось прочитать коллег: ${error.message}`)

  const люди = (data ?? []).filter((ч) => ч.id !== участник.id) as { id: string; user_id: string }[]
  if (!люди.length) return []

  const { data: пользователи } = await базаPublic()
    .from('users')
    .select('id, name')
    .in('id', люди.map((ч) => ч.user_id))

  const имена = new Map((пользователи ?? []).map((п) => [п.id as string, (п.name as string | null) ?? null]))
  return люди.map((ч) => ({ id: ч.id, имя: имена.get(ч.user_id) ?? 'без имени' }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Главная: счётчики и лента внимания. Раздел 4 дизайн-документа.
// ─────────────────────────────────────────────────────────────────────────────

export type СчётчикиНавигации = {
  клиентов: number
  наПроверку: number
  естьСрочные: boolean
  естьПросроченные: boolean
}

/**
 * Числа для сайдбара.
 *
 * Бейдж «На проверку» красится по худшему элементу очереди, а не по
 * количеству: десять обычных предложений спокойнее одного просроченного.
 */
export async function счётчикиНавигации(участник: Участник): Promise<СчётчикиНавигации> {
  const область = await видимыеДела(участник)
  if (область.пусто) {
    return { клиентов: 0, наПроверку: 0, естьСрочные: false, естьПросроченные: false }
  }

  const [{ data: предложения }, { data: задачи }] = await Promise.all([
    базаCare().from('proposals').select('id, created_at').in('case_id', область.дела).eq('status', 'pending'),
    базаCare()
      .from('tasks')
      .select('id, due_on, waiting_on')
      .in('case_id', область.дела)
      .eq('waiting_on', 'review')
      .not('status', 'in', '("done","failed")'),
  ])

  const сегодня = new Date().toISOString().slice(0, 10)
  const наПроверку = (предложения ?? []).length + (задачи ?? []).length

  return {
    клиентов: область.дела.length,
    наПроверку,
    естьСрочные: наПроверку > 0,
    естьПросроченные: (задачи ?? []).some((з) => з.due_on && з.due_on < сегодня),
  }
}

export type ПричинаВнимания = {
  текст: string
  вид: 'обычный' | 'ai' | 'amber' | 'error'
}

export type СтрокаВнимания = {
  caseId: string
  имя: string
  контекст: string
  уровень: 'просрочен' | 'горит' | 'сегодня' | 'ждёт' | 'спокойно'
  причины: ПричинаВнимания[]
  действие: string
  is_synthetic: boolean
}

export type Главная = {
  всегоДел: number
  требуютВас: number
  предложений: number
  просроченныхЗадач: number
  дедлайновЗа14Дней: number
  ошибокОпераций: number
  лента: СтрокаВнимания[]
}

/**
 * Чем заняться прямо сейчас.
 *
 * Раздел 4: главная отвечает не «как распределены клиенты по этапам», а
 * «за что хвататься». Поэтому сортировка по срочности, а причины — строками
 * с числом или датой внутри. Причина без числа («есть задачи») не помогает
 * решить, открывать ли карточку.
 */
export async function главная(участник: Участник): Promise<Главная> {
  const область = await видимыеДела(участник)
  const пусто: Главная = {
    всегоДел: 0,
    требуютВас: 0,
    предложений: 0,
    просроченныхЗадач: 0,
    дедлайновЗа14Дней: 0,
    ошибокОпераций: 0,
    лента: [],
  }
  if (область.пусто) return пусто

  const [{ data: дела }, { data: задачи }, { data: предложения }, { data: факты }] = await Promise.all([
    базаCare()
      .from('cases')
      .select('id, client_id, intake_year, service_scope, is_synthetic, synthetic_name, notes')
      .in('id', область.дела),
    базаCare()
      .from('tasks')
      .select('case_id, title, status, waiting_on, due_on, updated_at')
      .in('case_id', область.дела)
      .not('status', 'in', '("done","failed")'),
    базаCare().from('proposals').select('case_id, kind, created_at').in('case_id', область.дела).eq('status', 'pending'),
    базаCare().from('facts').select('case_id').in('case_id', область.дела).eq('status', 'draft'),
  ])

  const список = (дела ?? []) as (ЗаписьДела & { notes: string | null })[]
  const клиенты = await клиентыПоId(список.filter((д) => !д.is_synthetic).map((д) => д.client_id))

  const сегодня = new Date().toISOString().slice(0, 10)
  const через14 = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)

  const лента: СтрокаВнимания[] = []
  let просроченныхВсего = 0
  let дедлайновВсего = 0

  for (const д of список) {
    const свои = (задачи ?? []).filter((з) => з.case_id === д.id)
    const своиПредложения = (предложения ?? []).filter((п) => п.case_id === д.id)
    const своиЧерновики = (факты ?? []).filter((ф) => ф.case_id === д.id)

    const просрочено = свои.filter((з) => з.due_on && з.due_on < сегодня)
    const близко = свои.filter((з) => з.due_on && з.due_on >= сегодня && з.due_on <= через14)
    const ждёмКлиента = свои.filter((з) => з.waiting_on === 'client')

    просроченныхВсего += просрочено.length
    дедлайновВсего += близко.length

    const причины: ПричинаВнимания[] = []

    if (просрочено.length) {
      const худшая = просрочено.sort((а, б) => (а.due_on ?? '').localeCompare(б.due_on ?? ''))[0]
      const дней = Math.ceil((Date.now() - new Date(худшая.due_on!).getTime()) / 86_400_000)
      причины.push({
        текст: `«${худшая.title}» просрочена на ${дней} ${склонение(дней, 'день', 'дня', 'дней')}`,
        вид: 'error',
      })
    }
    if (своиПредложения.length) {
      причины.push({
        текст: `${своиПредложения.length} ${склонение(своиПредложения.length, 'предложение ждёт', 'предложения ждут', 'предложений ждут')} решения`,
        вид: 'ai',
      })
    }
    if (своиЧерновики.length) {
      причины.push({
        текст: `${своиЧерновики.length} ${склонение(своиЧерновики.length, 'факт не подтверждён', 'факта не подтверждены', 'фактов не подтверждены')}`,
        вид: 'ai',
      })
    }
    if (ждёмКлиента.length) {
      const давняя = ждёмКлиента.sort((а, б) => а.updated_at.localeCompare(б.updated_at))[0]
      const дней = Math.floor((Date.now() - new Date(давняя.updated_at).getTime()) / 86_400_000)
      причины.push({
        текст:
          дней > 0
            ? `ждём клиента ${дней} ${склонение(дней, 'день', 'дня', 'дней')}: «${давняя.title}»`
            : `ждём клиента: «${давняя.title}»`,
        вид: 'amber',
      })
    }
    if (близко.length && !просрочено.length) {
      const ближайшая = близко.sort((а, б) => (а.due_on ?? '').localeCompare(б.due_on ?? ''))[0]
      const дней = Math.ceil((new Date(ближайшая.due_on!).getTime() - Date.now()) / 86_400_000)
      причины.push({
        текст: `срок «${ближайшая.title}» через ${дней} ${склонение(дней, 'день', 'дня', 'дней')}`,
        вид: 'amber',
      })
    }

    // Дела без причин на главную не попадают: лента отвечает на вопрос «что
    // требует вас», а не «покажи всё». Список целиком — соседний экран.
    if (!причины.length) continue

    const уровень: СтрокаВнимания['уровень'] = просрочено.length
      ? 'просрочен'
      : своиПредложения.length || своиЧерновики.length
        ? 'ждёт'
        : близко.length
          ? 'горит'
          : 'спокойно'

    лента.push({
      caseId: д.id,
      имя: д.is_synthetic ? (д.synthetic_name ?? 'тестовое дело') : (клиенты.get(д.client_id)?.name ?? `Клиент #${д.client_id}`),
      контекст: [
        д.is_synthetic ? (д.notes ?? '').replace(/^Тестовое дело\.\s*Страна:\s*/, '').replace(/\.$/, '') : клиенты.get(д.client_id)?.country,
        д.service_scope,
        `набор ${д.intake_year}`,
      ]
        .filter(Boolean)
        .join(' · '),
      уровень,
      причины: причины.slice(0, 3),
      действие: своиПредложения.length || своиЧерновики.length ? 'Разобрать' : ждёмКлиента.length ? 'Напомнить' : 'Открыть',
      is_synthetic: д.is_synthetic,
    })
  }

  const порядок = { просрочен: 0, ждёт: 1, горит: 2, сегодня: 3, спокойно: 4 }
  лента.sort((а, б) => порядок[а.уровень] - порядок[б.уровень] || б.причины.length - а.причины.length)

  return {
    всегоДел: список.length,
    требуютВас: лента.length,
    предложений: (предложения ?? []).length + (факты ?? []).length,
    просроченныхЗадач: просроченныхВсего,
    дедлайновЗа14Дней: дедлайновВсего,
    ошибокОпераций: 0,
    лента,
  }
}

/** Что этот черновик заменит, если его принять. */
export type Заменяемое = {
  значение: unknown
  currency: string | null
  цитата: string | null
}

export type НаПроверку = {
  caseId: string
  имяКлиента: string
  контекст: string
  is_synthetic: boolean
  факты: (ПодробностиДела['факты'][number] & { заменяет: Заменяемое | null })[]
}

/**
 * Очередь проверки: всё неподтверждённое по всем делам куратора.
 *
 * Раздел 8 дизайн-документа: однородные мелочи должны проверяться подряд, а
 * не через открытие двадцати карточек. Куратор физически не может проверять
 * всё, если каждая мелочь требует навигации.
 *
 * У каждого черновика подтягивается текущее подтверждённое значение того же
 * поля, если оно есть. Без этого «Германия» в очереди читается как новое
 * сведение, хотя на самом деле она заменяет «Италию», — и куратор принимает
 * замену, не зная, что что-то заменяет.
 */
export async function очередьПроверки(участник: Участник): Promise<НаПроверку[]> {
  const область = await видимыеДела(участник)
  if (область.пусто) return []

  const { data: факты, error } = await базаCare()
    .from('facts')
    .select('id, case_id, field, value, unit, currency, status, is_plan, quote, version, created_at')
    .in('case_id', область.дела)
    .eq('status', 'draft')
    .order('created_at', { ascending: true })
  if (error) throw new Error(`не удалось прочитать очередь: ${error.message}`)

  const строки = (факты ?? []) as (ПодробностиДела['факты'][number] & { case_id: string })[]
  if (!строки.length) return []

  const идентификаторы = [...new Set(строки.map((ф) => ф.case_id))]

  // Что по этим полям считается верным сейчас. Одним запросом на всю очередь:
  // по запросу на строку — это сорок запросов на экран, который открывают
  // между делом.
  const { data: текущие } = await базаCare()
    .from('facts')
    .select('case_id, field, value, currency, quote')
    .in('case_id', идентификаторы)
    .eq('status', 'confirmed')

  const подтверждённое = new Map(
    (текущие ?? []).map((ф) => [`${ф.case_id}|${ф.field}`, ф])
  )
  const { data: дела } = await базаCare()
    .from('cases')
    .select('id, client_id, intake_year, service_scope, is_synthetic, synthetic_name')
    .in('id', идентификаторы)

  const список = (дела ?? []) as ЗаписьДела[]
  const клиенты = await клиентыПоId(список.filter((д) => !д.is_synthetic).map((д) => д.client_id))

  return список.map((д) => ({
    caseId: д.id,
    имяКлиента: д.is_synthetic
      ? (д.synthetic_name ?? 'тестовое дело')
      : (клиенты.get(д.client_id)?.name ?? `Клиент #${д.client_id}`),
    контекст: [клиенты.get(д.client_id)?.country, д.service_scope, `набор ${д.intake_year}`]
      .filter(Boolean)
      .join(' · '),
    is_synthetic: д.is_synthetic,
    факты: строки
      .filter((ф) => ф.case_id === д.id)
      .map((ф) => {
        const было = подтверждённое.get(`${ф.case_id}|${ф.field}`)
        return {
          ...ф,
          // null — поле заполняется впервые. Это разные решения: завести
          // сведение и заменить прежнее, — и выглядеть они должны по-разному.
          заменяет: было
            ? {
                значение: было.value as unknown,
                currency: (было.currency as string | null) ?? null,
                цитата: (было.quote as string | null) ?? null,
              }
            : null,
        }
      }),
  }))
}
