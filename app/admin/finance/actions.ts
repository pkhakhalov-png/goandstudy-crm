'use server'

import { revalidatePath } from 'next/cache'
import { viewer } from '@/lib/auth/viewer'
import { parseAmountToMinor, type Currency } from '@/lib/finance/money'
import {
  financeDb, financeAccess, postTransaction, reverseTransaction,
  signedAmount, type TxKind,
} from '@/lib/finance/service'

/**
 * Действия раздела «Финансы».
 *
 * Каждое начинается с проверки права на деньги — отдельного от роли CRM. Роль
 * администратора означает «ведёт клиентов», а не «видит и меняет деньги
 * компании» (PRD §5). Проверка на сервере, а не в интерфейсе: спрятанная кнопка
 * защищает от случайного нажатия, но не от прямого запроса.
 */
async function requireOwner() {
  const { user } = await viewer()
  if (!user) throw new Error('не авторизован')
  const level = await financeAccess(user.id)
  if (level !== 'owner' && level !== 'operator') throw new Error('нет прав на изменение финансов')
  return user
}

/**
 * Первый запуск: счета, начальные остатки, курс и доступ основателям.
 *
 * Здесь единственное исключение из проверки выше — пока доступа нет ни у кого,
 * выдать его некому. Поэтому первым владельцем становится администратор CRM,
 * который нажал кнопку, и только если таблица доступов пуста. Дальше доступы
 * раздаются уже изнутри модуля.
 */
export async function startAccounting(formData: FormData): Promise<{ error?: string }> {
  const { user, profile } = await viewer()
  if (!user) return { error: 'не авторизован' }

  const db = await financeDb()
  const { count, error: accessErr } = await db.from('access').select('user_id', { count: 'exact', head: true })
  if (accessErr) return { error: `доступы: ${accessErr.message}` }

  if ((count ?? 0) > 0) {
    const level = await financeAccess(user.id)
    if (level !== 'owner') return { error: 'учёт уже начат, и права на него у другого человека' }
  } else if (profile?.role !== 'admin') {
    return { error: 'начать учёт может только администратор CRM' }
  }

  const openingAt = String(formData.get('opening_at') || '').trim()
  if (!openingAt) return { error: 'укажите момент начала учёта' }

  // Счета приходят списком: имя, валюта, остаток. Пустые строки пропускаем —
  // человек мог оставить лишнюю форму незаполненной.
  const names = formData.getAll('account_name').map(String)
  const currencies = formData.getAll('account_currency').map(String) as Currency[]
  const openings = formData.getAll('account_opening').map(String)

  const rows: { name: string; currency: Currency; opening_minor: number }[] = []
  for (let i = 0; i < names.length; i++) {
    const name = names[i]?.trim()
    if (!name) continue
    const minor = openings[i]?.trim() ? parseAmountToMinor(openings[i]) : 0
    if (minor === null) return { error: `остаток «${openings[i]}» у счёта «${name}» не похож на сумму` }
    rows.push({ name, currency: currencies[i] ?? 'RUB', opening_minor: minor })
  }
  if (!rows.length) return { error: 'нужен хотя бы один счёт' }

  const { error } = await db.from('accounts').insert(
    rows.map((r) => ({ ...r, opening_at: new Date(openingAt).toISOString(), created_by: user.id })),
  )
  if (error) return { error: `счета: ${error.message}` }

  const rate = String(formData.get('rate') || '').replace(',', '.').trim()
  if (rate) {
    const value = Number(rate)
    if (Number.isFinite(value) && value > 0) {
      await db.from('exchange_rates').insert({
        rate_date: new Date(openingAt).toISOString().slice(0, 10),
        rub_per_usd: value, source: 'manual', created_by: user.id,
      })
    }
  }

  // Владельцы. Если никого не выбрали, владельцем становится тот, кто начал.
  const owners = formData.getAll('owner_id').map(String).filter(Boolean)
  const list = owners.length ? owners : [user.id]
  await db.from('access').upsert(
    list.map((id) => ({ user_id: id, level: 'owner', granted_by: user.id })),
    { onConflict: 'user_id' },
  )

  await db.from('audit_events').insert({
    actor_id: user.id, action: 'start_accounting', entity: 'accounts',
    after: { accounts: rows, opening_at: openingAt, owners: list },
  })

  revalidatePath('/admin/finance')
  return {}
}

/**
 * Ручной ввод операции.
 *
 * Знак суммы не спрашивается: его задаёт тип операции. Поле «−6000» в расходе и
 * «6000» в расходе означали бы одно и то же, а выглядели по-разному — это
 * будущая ошибка ввода.
 */
export async function addOperation(formData: FormData): Promise<{ error?: string }> {
  let user
  try { user = await requireOwner() } catch (e) { return { error: (e as Error).message } }

  const kind = String(formData.get('kind') || 'expense') as TxKind
  const amountRaw = String(formData.get('amount') || '')
  const minor = parseAmountToMinor(amountRaw)
  if (minor === null) return { error: `«${amountRaw}» не похоже на сумму` }

  const accountId = String(formData.get('account_id') || '')
  if (!accountId) return { error: 'выберите счёт' }

  const db = await financeDb()
  const { data: account } = await db.from('accounts').select('id, currency, opening_at, name').eq('id', accountId).single()
  if (!account) return { error: 'счёт не найден' }

  const occurredAt = String(formData.get('occurred_at') || '') || new Date().toISOString()
  if (new Date(occurredAt) < new Date(account.opening_at)) {
    return { error: `дата раньше начала учёта по счёту «${account.name}» — такие деньги уже в начальном остатке` }
  }

  const movements = [{
    accountId,
    amountMinor: signedAmount(kind, minor),
    currency: account.currency as Currency,
  }]

  // Перевод — это два движения одной операцией, иначе деньги на секунду
  // исчезают из отчётов, а при сбое исчезают совсем.
  if (kind === 'transfer') {
    const toId = String(formData.get('to_account_id') || '')
    if (!toId || toId === accountId) return { error: 'выберите второй счёт для перевода' }
    const { data: to } = await db.from('accounts').select('id, currency').eq('id', toId).single()
    if (!to) return { error: 'счёт получателя не найден' }

    const receivedRaw = String(formData.get('received') || '')
    const receivedMinor = receivedRaw.trim() ? parseAmountToMinor(receivedRaw) : minor
    if (receivedMinor === null) return { error: `«${receivedRaw}» не похоже на сумму зачисления` }
    if (to.currency !== account.currency && !receivedRaw.trim()) {
      return { error: 'для перевода между валютами нужна фактически зачисленная сумма' }
    }
    movements[0].amountMinor = -Math.abs(minor)
    movements.push({ accountId: toId, amountMinor: Math.abs(receivedMinor), currency: to.currency as Currency })
  }

  try {
    await postTransaction({
      kind,
      occurredAt: new Date(occurredAt).toISOString(),
      movements,
      categoryId: String(formData.get('category_id') || '') || null,
      counterpartyId: String(formData.get('counterparty_id') || '') || null,
      clientId: formData.get('client_id') ? Number(formData.get('client_id')) : null,
      note: String(formData.get('note') || '') || null,
      origin: 'crm',
      actorUserId: user.id,
      // Ключ строится из того, что человек ввёл: двойное нажатие кнопки не
      // должно записать расход дважды. Разные операции с одинаковой суммой в
      // одну секунду — редкость, и у них разный комментарий или счёт.
      idempotencyKey: `crm:${user.id}:${kind}:${accountId}:${minor}:${occurredAt}:${String(formData.get('note') || '').slice(0, 40)}`,
    })
  } catch (e) {
    return { error: (e as Error).message }
  }

  revalidatePath('/admin/finance')
  return {}
}

/** Отмена: обратные движения, исходная операция остаётся в истории. */
export async function reverseOperation(formData: FormData): Promise<{ error?: string }> {
  let user
  try { user = await requireOwner() } catch (e) { return { error: (e as Error).message } }

  const id = String(formData.get('transaction_id') || '')
  if (!id) return { error: 'не указана операция' }

  try {
    await reverseTransaction(id, user.id, String(formData.get('reason') || '') || undefined)
  } catch (e) {
    return { error: (e as Error).message }
  }

  revalidatePath('/admin/finance')
  return {}
}
