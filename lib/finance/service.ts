/**
 * Финансовое ядро: единственный путь, которым деньги попадают в базу.
 *
 * И раздел CRM, и телеграм-бот ходят сюда, а не пишут в таблицы сами. Иначе
 * получилось бы два набора правил, и рано или поздно они разошлись бы — ровно
 * то, чего PRD запрещает (§12.1: один реестр, один движок).
 *
 * Сама запись выполняется функцией в базе (`finance.post_transaction`): клиент
 * Supabase не умеет транзакций, а операция без своих движений по счетам — это
 * разъехавшийся остаток без объяснимой причины.
 */
import { createAdminClient } from '@/lib/supabase/server'
import { readAll } from '@/lib/supabase/read-all'
import type { Currency } from './money'
import { KIND_NAMES, signedAmount, type TxKind } from './kinds'

// Названия и знак суммы переэкспортируются, чтобы серверный код брал их
// отсюда, а браузер — напрямую из './kinds', не утаскивая ядро в бандл.
export { KIND_NAMES, signedAmount }
export type { TxKind }

export type Account = {
  id: string
  name: string
  currency: Currency
  opening_at: string
  opening_minor: number
  is_active: boolean
  archived_at: string | null
}

export type Balance = Account & { balance_minor: number; movements: number }

export async function financeDb() {
  return (await createAdminClient()).schema('finance') as any
}

/* ── Доступ ───────────────────────────────────────────────────────────────── */

/**
 * Право на деньги — отдельное от роли CRM.
 *
 * По PRD §5 доступ к CRM сам по себе финансовых прав не даёт: администратор
 * ведёт клиентов, но это не значит, что он видит остатки компании. Поэтому
 * проверка идёт по своей таблице, а не по `users.role`.
 */
export async function financeAccess(userId: string | undefined | null): Promise<'owner' | 'operator' | 'viewer' | null> {
  if (!userId) return null
  const db = await financeDb()
  const { data } = await db.from('access').select('level, revoked_at').eq('user_id', userId).maybeSingle()
  if (!data || data.revoked_at) return null
  return data.level
}

export async function requireFinanceAccess(userId: string | undefined | null) {
  const level = await financeAccess(userId)
  if (!level) throw new Error('нет доступа к финансам')
  return level
}

/* ── Чтение ───────────────────────────────────────────────────────────────── */

export async function listAccounts(includeArchived = false): Promise<Account[]> {
  const db = await financeDb()
  let q = db.from('accounts').select('*').order('created_at')
  if (!includeArchived) q = q.is('archived_at', null)
  const { data, error } = await q
  if (error) throw new Error(`accounts: ${error.message}`)
  return data ?? []
}

/**
 * Остатки. Считаются представлением из журнала движений, а не хранятся числом:
 * хранимый остаток однажды разойдётся с журналом, и никто этого не заметит.
 */
export async function balances(): Promise<Balance[]> {
  const db = await financeDb()
  const { data, error } = await db.from('account_balances').select('*')
  if (error) throw new Error(`account_balances: ${error.message}`)
  const accounts = await listAccounts(true)
  return (data ?? [])
    .map((b: any) => {
      const acc = accounts.find((a) => a.id === b.account_id)
      return { ...acc, ...b, id: b.account_id } as Balance
    })
    .filter((b: Balance) => !b.archived_at)
}

export type TxFilter = {
  from?: string
  to?: string
  accountId?: string
  kind?: TxKind
  clientId?: number
  limit?: number
}

export type TxRow = {
  id: string
  kind: TxKind
  occurred_at: string
  note: string | null
  origin: string
  status: string
  // Идентификатор, а не только имя: по нему экран ставит выбранную категорию в
  // выпадающем списке и отправляет смену. По имени это пришлось бы искать
  // обратным поиском по справочнику, и совпадение имён его бы сломало.
  category_id: string | null
  category: { name: string } | null
  counterparty: { name: string } | null
  client: { name: string } | null
  movements: { account_id: string; amount_minor: number; currency: Currency }[]
}

export async function listTransactions(filter: TxFilter = {}): Promise<TxRow[]> {
  const db = await financeDb()
  const limit = filter.limit ?? 200

  // Клиент не подтягивается связью: PostgREST не умеет связывать таблицы из
  // разных схем, а `clients` живёт в public. Имена берём вторым запросом ниже —
  // это один поход до базы, а не по одному на строку.
  let q = db.from('transactions')
    .select(`
      id, kind, occurred_at, note, origin, status, client_id, category_id,
      category:categories(name),
      counterparty:counterparties(name),
      movements(account_id, amount_minor, currency)
    `)
    .neq('status', 'superseded')
    .order('occurred_at', { ascending: false })
    .limit(limit)

  if (filter.from) q = q.gte('occurred_at', filter.from)
  if (filter.to) q = q.lte('occurred_at', filter.to)
  if (filter.kind) q = q.eq('kind', filter.kind)
  if (filter.clientId) q = q.eq('client_id', filter.clientId)

  const { data, error } = await q
  if (error) throw new Error(`transactions: ${error.message}`)

  const rows = (data ?? []) as (TxRow & { client_id: number | null })[]

  const clientIds = [...new Set(rows.map((r) => r.client_id).filter(Boolean))] as number[]
  if (clientIds.length) {
    const sb = await createAdminClient()
    const { data: clients } = await sb.from('clients').select('id, name').in('id', clientIds)
    for (const r of rows) {
      const c = (clients ?? []).find((x: any) => x.id === r.client_id)
      r.client = c ? { name: c.name } : null
    }
  }

  // Фильтр по счёту — по движениям, а не по операции: у перевода их два, и он
  // обязан попадать в выписку обоих счетов.
  return filter.accountId
    ? rows.filter((r) => r.movements.some((m) => m.account_id === filter.accountId))
    : rows
}

/**
 * Итоги за период по валютам.
 *
 * Внутренние переводы исключаются: перемещение своих денег между своими
 * счетами — не поступление и не расход, иначе оборот компании раздувается на
 * пустом месте (PRD §4).
 */
export type PeriodTotals = Record<Currency, { income: number; expense: number; net: number }>

export async function periodTotals(from: string, to: string): Promise<PeriodTotals> {
  const db = await financeDb()
  const rows = await readAll<any>(() => db
    .from('movements')
    .select('amount_minor, currency, transactions!inner(kind, occurred_at, status)')
    .gte('transactions.occurred_at', from)
    .lte('transactions.occurred_at', to)
    .neq('transactions.status', 'superseded')
    .order('id'), { label: 'movements' })

  const out: PeriodTotals = {
    RUB: { income: 0, expense: 0, net: 0 },
    USD: { income: 0, expense: 0, net: 0 },
  }

  for (const r of rows) {
    const kind: TxKind = r.transactions.kind
    if (kind === 'transfer') continue
    const cur = r.currency as Currency
    const amount = r.amount_minor as number

    // По ВИДУ операции, а не по знаку суммы — то же правило, что в dailyFlow.
    // По знаку отмена расхода (сумма положительная, деньги вернулись) попадала
    // в поступления, хотя несостоявшаяся трата приходом не является. Обороты
    // от этого росли с обеих сторон: 15 сентября показывало по 1 218 000 ₽
    // туда и обратно, хотя в тот день не осталось ни одной живой операции.
    //
    // Итог (net) правило не меняет: он и был суммой со знаком.
    if (kind === 'income' || kind === 'refund_out') out[cur].income += amount
    else out[cur].expense -= amount

    out[cur].net += amount
  }
  return out
}

/**
 * Движение денег по дням — для графика.
 *
 * Считается по тем же правилам, что и итоги периода, и это важнее удобства:
 * если график и карточка месяца разойдутся хоть на рубль, верить перестанут
 * обоим. Поэтому переводы между своими счетами исключаются здесь так же, как
 * там, — перемещение своих денег не приход и не расход.
 *
 * Накопительный остаток считается внутри периода, от нуля: это «сколько
 * набежало за выбранное окно», а не остаток на счетах. Остаток на счетах
 * показан карточками выше и включает начальные суммы, которых в движениях нет.
 */
export type DayFlow = {
  day: string
  income: number
  expense: number
  net: number
  cumulative: number
}

export async function dailyFlow(from: string, to: string): Promise<Record<Currency, DayFlow[]>> {
  const db = await financeDb()
  const rows = await readAll<any>(() => db
    .from('movements')
    .select('amount_minor, currency, transactions!inner(kind, occurred_at, status)')
    .gte('transactions.occurred_at', from)
    .lte('transactions.occurred_at', to)
    .neq('transactions.status', 'superseded')
    .order('id'), { label: 'movements' })

  const поДням: Record<string, Map<string, { income: number; expense: number }>> = { RUB: new Map(), USD: new Map() }

  for (const r of rows) {
    const kind: TxKind = r.transactions.kind
    if (kind === 'transfer') continue
    const cur = r.currency as Currency
    const день = String(r.transactions.occurred_at).slice(0, 10)
    const узел = поДням[cur].get(день) ?? { income: 0, expense: 0 }
    const сумма = r.amount_minor as number

    // Раскладываем по ВИДУ операции, а не по знаку суммы.
    //
    // По знаку выходило так: отмена расхода имеет положительную сумму — деньги
    // вернулись на счёт, — и попадала в поступления. Но отмена траты это не
    // приход, это несостоявшаяся трата. На живых данных 15 сентября давало
    // +1 218 000 и −1 218 000 ₽ в один день: сторно удваивало обе стороны и
    // вчетверо задирало шкалу, расплющивая остальные двенадцать дней.
    //
    // По виду отмена уменьшает ту сторону, к которой относилась: расход со
    // знаком плюс вычитается из расходов. Обороты перестают расти на пустом
    // месте, а итог остаётся прежним.
    if (kind === 'income' || kind === 'refund_out') узел.income += сумма
    else узел.expense -= сумма

    поДням[cur].set(день, узел)
  }

  const out = {} as Record<Currency, DayFlow[]>
  for (const cur of ['RUB', 'USD'] as Currency[]) {
    let накоплено = 0
    out[cur] = [...поДням[cur].entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, v]) => {
        const net = v.income - v.expense
        накоплено += net
        return { day, income: v.income, expense: v.expense, net, cumulative: накоплено }
      })
  }
  return out
}

/**
 * Разрез по категориям — для круговых диаграмм.
 *
 * Доходы и расходы считаются отдельно и рисуются двумя диаграммами. Свести их
 * в одну нельзя: доля категории в круге отвечает на вопрос «из чего состоит
 * это целое», а поступления и траты — два разных целых. В общем круге
 * «Зарплаты» заняли бы долю от суммы всех денег, которая ничего не значит.
 *
 * Правило раскладки то же, что в dailyFlow и periodTotals: по виду операции, а
 * не по знаку суммы, и без переводов между своими счетами.
 *
 * Цвет категории не зависит от выбранного периода. Порядок цветов берётся из
 * оборота ЗА ВСЁ ВРЕМЯ, а не внутри периода: иначе смена месяца перекрашивала
 * бы категории, которые никуда не делись, и сравнить два месяца глазами стало
 * бы нельзя.
 */
export type CategorySlice = {
  id: string | null
  name: string
  amount: number
}

export type CategoryBreakdown = {
  income: CategorySlice[]
  expense: CategorySlice[]
  /** Порядок категорий по обороту за всё время — по нему назначаются цвета. */
  порядок: string[]
}

export async function categoryBreakdown(
  from: string, to: string, currency: Currency,
): Promise<CategoryBreakdown> {
  const db = await financeDb()

  const собрать = async (от: string | null, до: string | null) => {
    let q = db.from('movements')
      .select('amount_minor, currency, transactions!inner(kind, occurred_at, status, category_id)')
      .eq('currency', currency)
      .neq('transactions.status', 'superseded')
    if (от) q = q.gte('transactions.occurred_at', от)
    if (до) q = q.lte('transactions.occurred_at', до)
    return readAll<any>(() => q.order('id'), { label: 'movements' })
  }

  const [вПериоде, заВсёВремя] = await Promise.all([собрать(from, to), собрать(null, null)])

  const имена = new Map<string, string>()
  const { data: cats } = await db.from('categories').select('id, name')
  for (const c of (cats ?? []) as any[]) имена.set(c.id, c.name)

  const свернуть = (rows: any[]) => {
    const доход = new Map<string, number>()
    const расход = new Map<string, number>()
    const всего = new Map<string, number>()
    for (const r of rows) {
      const kind: TxKind = r.transactions.kind
      if (kind === 'transfer') continue
      const ключ = r.transactions.category_id ?? ''
      const сумма = r.amount_minor as number
      const куда = (kind === 'income' || kind === 'refund_out') ? доход : расход
      const вклад = куда === доход ? сумма : -сумма
      куда.set(ключ, (куда.get(ключ) ?? 0) + вклад)
      всего.set(ключ, (всего.get(ключ) ?? 0) + Math.abs(вклад))
    }
    return { доход, расход, всего }
  }

  const п = свернуть(вПериоде)
  const в = свернуть(заВсёВремя)

  const вСписок = (m: Map<string, number>): CategorySlice[] =>
    [...m.entries()]
      .filter(([, v]) => v > 0)
      .map(([id, amount]) => ({
        id: id || null,
        name: id ? (имена.get(id) ?? 'Категория удалена') : 'Без категории',
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)

  return {
    income: вСписок(п.доход),
    expense: вСписок(п.расход),
    порядок: [...в.всего.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id || ''),
  }
}

/**
 * Текущий справочный курс.
 *
 * Нужен только для строки «всего», где два остатка сводятся в одно число: для
 * самого учёта курс не требуется, долларовые расходы идут по долларовому счёту,
 * рублёвые — по рублёвому. Если курса на сегодня нет, спрашиваем ЦБ и
 * запоминаем; ручной курс на ту же дату главнее автоматического.
 */
export async function currentRate(): Promise<{ rub_per_usd: number; rate_date: string; source?: string } | null> {
  const db = await financeDb()
  const { ensureTodayRate } = await import('./rate')
  return ensureTodayRate(db)
}

/* ── Запись ───────────────────────────────────────────────────────────────── */

export type Movement = { accountId: string; amountMinor: number; currency: Currency }

export type PostInput = {
  kind: TxKind
  occurredAt: string
  movements: Movement[]
  categoryId?: string | null
  counterpartyId?: string | null
  clientId?: number | null
  dealId?: string | null
  note?: string | null
  origin?: 'crm' | 'telegram' | 'import'
  sourceEventId?: string | null
  /**
   * Кто внёс операцию. Может быть null: в общей группе пишут и те, у кого нет
   * учётной записи в CRM, и приписывать их операции другому человеку нельзя.
   * Кто именно писал, остаётся в журнале событий телеграма.
   */
  actorUserId: string | null
  crmPaymentId?: number | null
  crmExpenseId?: string | null
  rateRubPerUsd?: number | null
  obligationId?: string | null
  allocatedMinor?: number | null
  founderUserId?: string | null
  claimAmountMinor?: number | null
  claimCurrency?: Currency | null
  /**
   * Ключ идемпотентности. Повтор с тем же ключом и тем же телом вернёт прежний
   * результат, а не запишет деньги второй раз. Для телеграма это `update_id`
   * сообщения: ретрай вебхука — обычное дело, повторный расход — нет.
   */
  idempotencyKey: string
}

export type PostResult = {
  transaction_id: string
  balances: { account_id: string; balance_minor: number }[]
}

export async function postTransaction(input: PostInput): Promise<PostResult> {
  const db = await financeDb()

  const payload: Record<string, unknown> = {
    kind: input.kind,
    occurred_at: input.occurredAt,
    movements: input.movements.map((m) => ({
      account_id: m.accountId,
      amount_minor: m.amountMinor,
      currency: m.currency,
    })),
    category_id: input.categoryId ?? null,
    counterparty_id: input.counterpartyId ?? null,
    client_id: input.clientId ?? null,
    deal_id: input.dealId ?? null,
    note: input.note ?? null,
    origin: input.origin ?? 'crm',
    source_event_id: input.sourceEventId ?? null,
    actor_user_id: input.actorUserId,
    created_by: input.actorUserId,
    crm_payment_id: input.crmPaymentId ?? null,
    crm_expense_id: input.crmExpenseId ?? null,
    rate_rub_per_usd: input.rateRubPerUsd ?? null,
    idempotency_key: input.idempotencyKey,
  }

  if (input.obligationId) {
    payload.obligation_id = input.obligationId
    payload.allocated_minor = input.allocatedMinor ?? Math.abs(input.movements[0]?.amountMinor ?? 0)
  }
  if (input.kind === 'founder_expense') {
    payload.founder_user_id = input.founderUserId
    payload.claim_amount_minor = input.claimAmountMinor
    payload.claim_currency = input.claimCurrency
  }

  const { data, error } = await db.rpc('post_transaction', { p: payload })
  if (error) throw new Error(error.message)
  return data as PostResult
}

/**
 * Отмена. Не удаление и не правка суммы: создаются обратные движения, исходная
 * операция остаётся видимой со статусом «отменена». Факт и его отмена вместе
 * дают ноль — так остаток объясним в любой момент времени.
 */
export async function reverseTransaction(
  transactionId: string, actorUserId: string | null, reason?: string, idempotencyKey?: string,
): Promise<{ reversal_id: string }> {
  const db = await financeDb()
  const { data, error } = await db.rpc('reverse_transaction', {
    p_transaction: transactionId,
    p_actor: actorUserId,
    p_reason: reason ?? null,
    p_idempotency_key: idempotencyKey ?? null,
  })
  if (error) throw new Error(error.message)
  return data
}

/**
 * Исправление: отмена прежней редакции и запись новой, обе в одной цепочке.
 * «Было 6000, стало 6500» даёт дополнительное списание 500 и две видимые
 * редакции, а не молча переписанную сумму.
 */
export async function correctTransaction(transactionId: string, input: PostInput): Promise<PostResult> {
  const db = await financeDb()
  const payload = {
    kind: input.kind,
    occurred_at: input.occurredAt,
    movements: input.movements.map((m) => ({
      account_id: m.accountId, amount_minor: m.amountMinor, currency: m.currency,
    })),
    category_id: input.categoryId ?? null,
    counterparty_id: input.counterpartyId ?? null,
    client_id: input.clientId ?? null,
    note: input.note ?? null,
    origin: input.origin ?? 'crm',
    actor_user_id: input.actorUserId,
    created_by: input.actorUserId,
    idempotency_key: input.idempotencyKey,
  }
  const { data, error } = await db.rpc('correct_transaction', { p_transaction: transactionId, p: payload })
  if (error) throw new Error(error.message)
  return data as PostResult
}

/* ── Справочники ──────────────────────────────────────────────────────────── */

export async function listCategories(kind?: TxKind) {
  const db = await financeDb()
  const { data, error } = await db.from('categories').select('*').is('archived_at', null).order('sort')
  if (error) throw new Error(`categories: ${error.message}`)
  const all = data ?? []
  return kind ? all.filter((c: any) => !c.allowed_kinds?.length || c.allowed_kinds.includes(kind)) : all
}

export async function listCounterparties() {
  const db = await financeDb()
  const { data, error } = await db.from('counterparties').select('*').is('archived_at', null).order('name')
  if (error) throw new Error(`counterparties: ${error.message}`)
  return data ?? []
}

