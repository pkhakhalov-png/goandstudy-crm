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
import { INBOUND, KIND_NAMES, signedAmount, type TxKind } from './kinds'

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
  category: { name: string } | null
  counterparty: { name: string } | null
  client: { name: string } | null
  movements: { account_id: string; amount_minor: number; currency: Currency }[]
}

export async function listTransactions(filter: TxFilter = {}): Promise<TxRow[]> {
  const db = await financeDb()
  const limit = filter.limit ?? 200

  let q = db.from('transactions')
    .select(`
      id, kind, occurred_at, note, origin, status,
      category:categories(name),
      counterparty:counterparties(name),
      client:clients(name),
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

  const rows = (data ?? []) as TxRow[]
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
    if (amount > 0) out[cur].income += amount
    else out[cur].expense += -amount
    out[cur].net += amount
  }
  return out
}

/** Текущий справочный курс: последний введённый вручную. */
export async function currentRate(): Promise<{ rub_per_usd: number; rate_date: string } | null> {
  const db = await financeDb()
  const { data } = await db.from('exchange_rates')
    .select('rub_per_usd, rate_date')
    .eq('source', 'manual')
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? { rub_per_usd: Number(data.rub_per_usd), rate_date: data.rate_date } : null
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
  actorUserId: string
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
  transactionId: string, actorUserId: string, reason?: string, idempotencyKey?: string,
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

