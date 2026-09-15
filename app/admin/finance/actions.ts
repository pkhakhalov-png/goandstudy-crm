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

/**
 * Справочный курс рубля к доллару.
 *
 * Курс вводится руками и только на дату: автоматического источника в первой
 * версии нет. Прошлые снимки не переписываются — изменение сегодняшнего курса
 * не должно задним числом менять уже посчитанные оценки (PRD §10.2).
 */
export async function setRate(formData: FormData): Promise<{ error?: string }> {
  let user
  try { user = await requireOwner() } catch (e) { return { error: (e as Error).message } }

  const raw = String(formData.get('rate') || '').replace(',', '.').trim()
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return { error: `«${raw}» не похоже на курс` }

  const date = String(formData.get('rate_date') || '') || new Date().toISOString().slice(0, 10)
  const db = await financeDb()
  const { error } = await db.from('exchange_rates').upsert(
    { rate_date: date, rub_per_usd: value, source: 'manual', created_by: user.id },
    { onConflict: 'rate_date,source' },
  )
  if (error) return { error: `курс: ${error.message}` }

  revalidatePath('/admin/finance')
  revalidatePath('/admin/finance/setup')
  return {}
}

/**
 * Выдать доступ к финансам.
 *
 * Отдельно от ролей CRM: администратор ведёт клиентов, но деньги компании — это
 * другое право, и раздаётся оно поимённо (PRD §5).
 */
export async function grantAccess(formData: FormData): Promise<{ error?: string }> {
  let user
  try { user = await requireOwner() } catch (e) { return { error: (e as Error).message } }

  const userId = String(formData.get('user_id') || '')
  const level = String(formData.get('level') || 'owner')
  if (!userId) return { error: 'выберите человека' }
  if (!['owner', 'operator', 'viewer'].includes(level)) return { error: 'неизвестный уровень доступа' }

  const db = await financeDb()
  const { error } = await db.from('access').upsert(
    { user_id: userId, level, granted_by: user.id, revoked_at: null },
    { onConflict: 'user_id' },
  )
  if (error) return { error: `доступ: ${error.message}` }

  await db.from('audit_events').insert({
    actor_id: user.id, action: 'grant_access', entity: 'access', entity_id: userId, after: { level },
  })

  revalidatePath('/admin/finance/setup')
  return {}
}

/** Отозвать доступ. Себя последним владельцем отозвать нельзя. */
export async function revokeAccess(formData: FormData): Promise<{ error?: string }> {
  let user
  try { user = await requireOwner() } catch (e) { return { error: (e as Error).message } }

  const userId = String(formData.get('user_id') || '')
  const db = await financeDb()

  const { data: owners } = await db.from('access').select('user_id').eq('level', 'owner').is('revoked_at', null)
  if ((owners ?? []).length <= 1 && owners?.[0]?.user_id === userId) {
    return { error: 'это последний владелец — без него модуль станет никому не доступен' }
  }

  const { error } = await db.from('access').update({ revoked_at: new Date().toISOString() }).eq('user_id', userId)
  if (error) return { error: `доступ: ${error.message}` }

  await db.from('audit_events').insert({
    actor_id: user.id, action: 'revoke_access', entity: 'access', entity_id: userId,
  })

  revalidatePath('/admin/finance/setup')
  return {}
}

/**
 * Одноразовая ссылка для привязки телеграма.
 *
 * Токен живёт пятнадцать минут и гасится при использовании. В базе хранится
 * только его хэш: утечка таблицы не должна давать возможность привязаться
 * чужим телеграмом.
 *
 * Привязка идёт к числовому id телеграма, а не к username: username меняется, и
 * тогда доступ к деньгам уехал бы вместе с ним.
 */
export async function createTelegramLink(): Promise<{ url?: string; error?: string }> {
  let user
  try { user = await requireOwner() } catch (e) { return { error: (e as Error).message } }

  const { tgGetMe } = await import('@/lib/finance/telegram')
  const me = await tgGetMe()
  if (!me?.username) return { error: 'бот не отвечает — проверьте TELEGRAM_FINANCE_BOT_TOKEN' }

  const token = crypto.randomUUID().replace(/-/g, '')
  const hash = await sha256(token)

  const db = await financeDb()
  const { error } = await db.from('link_tokens').insert({
    token_hash: hash,
    user_id: user.id,
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  })
  if (error) return { error: `ссылка: ${error.message}` }

  return { url: `https://t.me/${me.username}?start=${token}` }
}

async function sha256(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
