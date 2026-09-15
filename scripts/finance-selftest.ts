/**
 * Контрольные сценарии финансового ядра — из PRD §17.
 *
 *   npx tsx scripts/finance-selftest.ts
 *
 * Гоняет деньги по временным счетам с пометкой «ТЕСТ» и в конце удаляет всё,
 * что создал. Настоящие счета и операции не трогает: отбор идёт по префиксу
 * ключа идемпотентности и по id созданных счетов.
 *
 * Зачем это отдельно от «работает ли приложение». Приложение может открываться,
 * рисовать карточки и при этом терять копейку на каждом переводе. Здесь
 * проверяются не экраны, а сходимость: остаток после каждой операции сверяется
 * с ожидаемым числом, посчитанным вручную.
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const fin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
).schema('finance') as any

const TAG = `selftest-${Date.now()}`
let failures = 0
const created: { accounts: string[]; keys: string[] } = { accounts: [], keys: [] }

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    ожидали ${JSON.stringify(want)}, получили ${JSON.stringify(got)}`}`)
}

function checkFails(name: string, error: unknown, expectPart: string) {
  const msg = error ? String((error as any).message ?? error) : ''
  const ok = msg.includes(expectPart)
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    ждали отказ со словами «${expectPart}», получили: ${msg || 'операция прошла'}`}`)
}

async function balance(accountId: string): Promise<number> {
  const { data, error } = await fin.rpc('balance_minor', { p_account: accountId, p_as_of: null })
  if (error) throw new Error(error.message)
  return Number(data)
}

async function post(payload: Record<string, unknown>) {
  const key = `${TAG}:${payload.idempotency_key}`
  created.keys.push(key)
  const { data, error } = await fin.rpc('post_transaction', { p: { ...payload, idempotency_key: key } })
  return { data, error }
}

async function main() {
  console.log(`КОНТРОЛЬНЫЕ СЦЕНАРИИ ФИНАНСОВОГО ЯДРА · ${TAG}\n${'─'.repeat(78)}`)

  // Начало учёта на час назад: операции «сегодня» должны проходить, а более
  // ранние — отбиваться границей.
  const openingAt = new Date(Date.now() - 3600_000).toISOString()
  const { data: accounts, error: accErr } = await fin.from('accounts').insert([
    { name: 'ТЕСТ · рубли', currency: 'RUB', opening_at: openingAt, opening_minor: 10_000_000 },
    { name: 'ТЕСТ · доллары', currency: 'USD', opening_at: openingAt, opening_minor: 100_000 },
  ]).select('id, currency, name')
  if (accErr) throw new Error(`не удалось создать тестовые счета: ${accErr.message}`)

  const rub = accounts.find((a: any) => a.currency === 'RUB')
  const usd = accounts.find((a: any) => a.currency === 'USD')
  created.accounts.push(rub.id, usd.id)

  check('стартовый остаток 100 000 ₽', await balance(rub.id), 10_000_000)
  check('стартовый остаток 1 000 $', await balance(usd.id), 100_000)

  /* §17.1 — расход 6 000 ₽ */
  const r1 = await post({
    idempotency_key: 'sc1', kind: 'expense', occurred_at: new Date().toISOString(),
    movements: [{ account_id: rub.id, amount_minor: -600_000, currency: 'RUB' }],
  })
  if (r1.error) throw new Error(`сценарий 1 не прошёл: ${r1.error.message}`)
  check('§17.1 после расхода 6 000 ₽ остаётся 94 000 ₽', await balance(rub.id), 9_400_000)

  /* §17.2 — приход 50 000 ₽ и расход 20 $ */
  await post({
    idempotency_key: 'sc2-in', kind: 'income', occurred_at: new Date().toISOString(),
    movements: [{ account_id: rub.id, amount_minor: 5_000_000, currency: 'RUB' }],
  })
  await post({
    idempotency_key: 'sc2-out', kind: 'expense', occurred_at: new Date().toISOString(),
    movements: [{ account_id: usd.id, amount_minor: -2_000, currency: 'USD' }],
  })
  check('§17.2 рубли 144 000', await balance(rub.id), 14_400_000)
  check('§17.2 доллары 980', await balance(usd.id), 98_000)

  /* §17.3 — перевод 90 000 ₽ → 1 000 $, комиссия 500 ₽ отдельно */
  const tr = await post({
    idempotency_key: 'sc3-transfer', kind: 'transfer', occurred_at: new Date().toISOString(),
    movements: [
      { account_id: rub.id, amount_minor: -9_000_000, currency: 'RUB' },
      { account_id: usd.id, amount_minor: 100_000, currency: 'USD' },
    ],
  })
  if (tr.error) throw new Error(`перевод не прошёл: ${tr.error.message}`)
  await post({
    idempotency_key: 'sc3-fee', kind: 'fee', occurred_at: new Date().toISOString(),
    movements: [{ account_id: rub.id, amount_minor: -50_000, currency: 'RUB' }],
  })
  check('§17.3 рубли 53 500', await balance(rub.id), 5_350_000)
  check('§17.3 доллары 1 980', await balance(usd.id), 198_000)

  /* §17.4 — пять повторов одного и того же события */
  const before = await balance(rub.id)
  for (let i = 0; i < 5; i++) {
    await post({
      idempotency_key: 'sc4-repeat', kind: 'expense', occurred_at: new Date().toISOString(),
      movements: [{ account_id: rub.id, amount_minor: -100_000, currency: 'RUB' }],
    })
  }
  check('§17.4 пять повторов списывают ровно один раз', await balance(rub.id), before - 100_000)

  /* §17.5 — два человека одновременно вносят разные расходы */
  const beforeParallel = await balance(rub.id)
  await Promise.all([
    post({
      idempotency_key: 'sc5-a', kind: 'expense', occurred_at: new Date().toISOString(),
      movements: [{ account_id: rub.id, amount_minor: -30_000, currency: 'RUB' }],
    }),
    post({
      idempotency_key: 'sc5-b', kind: 'expense', occurred_at: new Date().toISOString(),
      movements: [{ account_id: rub.id, amount_minor: -70_000, currency: 'RUB' }],
    }),
  ])
  check('§17.5 одновременные расходы сохранены оба по разу', await balance(rub.id), beforeParallel - 100_000)

  /* Тот же ключ с другим телом — это не повтор, а ошибка */
  const conflict = await post({
    idempotency_key: 'sc4-repeat', kind: 'expense', occurred_at: new Date().toISOString(),
    movements: [{ account_id: rub.id, amount_minor: -999_999, currency: 'RUB' }],
  })
  checkFails('тот же ключ с другой суммой отклонён', conflict.error, 'уже использован')

  /* §17.14 — валюта движения против валюты счёта */
  const wrongCurrency = await post({
    idempotency_key: 'sc14', kind: 'expense', occurred_at: new Date().toISOString(),
    movements: [{ account_id: usd.id, amount_minor: -600_000, currency: 'RUB' }],
  })
  checkFails('§17.14 рублёвое списание с долларового счёта не проходит', wrongCurrency.error, 'movements')

  /* Граница начала учёта */
  const beforeOpening = await post({
    idempotency_key: 'before-opening', kind: 'expense',
    occurred_at: new Date(Date.now() - 7 * 86400_000).toISOString(),
    movements: [{ account_id: rub.id, amount_minor: -100_000, currency: 'RUB' }],
  })
  checkFails('операция до начала учёта не проходит', beforeOpening.error, 'раньше начала учёта')

  /* Перевод без второй стороны */
  const halfTransfer = await post({
    idempotency_key: 'half-transfer', kind: 'transfer', occurred_at: new Date().toISOString(),
    movements: [{ account_id: rub.id, amount_minor: -100_000, currency: 'RUB' }],
  })
  checkFails('перевод с одной стороной не проходит', halfTransfer.error, 'ровно два движения')

  /* Расход с положительной суммой */
  const wrongSign = await post({
    idempotency_key: 'wrong-sign', kind: 'expense', occurred_at: new Date().toISOString(),
    movements: [{ account_id: rub.id, amount_minor: 100_000, currency: 'RUB' }],
  })
  checkFails('расход на плюс не проходит', wrongSign.error, 'не может быть положительной')

  /* §17.11 — отмена возвращает остаток */
  const beforeReverse = await balance(rub.id)
  const toReverse = await post({
    idempotency_key: 'to-reverse', kind: 'expense', occurred_at: new Date().toISOString(),
    movements: [{ account_id: rub.id, amount_minor: -250_000, currency: 'RUB' }],
  })
  check('до отмены списано 2 500 ₽', await balance(rub.id), beforeReverse - 250_000)
  const { error: revErr } = await fin.rpc('reverse_transaction', {
    p_transaction: toReverse.data.transaction_id, p_actor: null, p_reason: 'самопроверка', p_idempotency_key: `${TAG}:rev`,
  })
  created.keys.push(`${TAG}:rev`)
  if (revErr) throw new Error(`отмена не прошла: ${revErr.message}`)
  check('§17.11 после отмены остаток вернулся', await balance(rub.id), beforeReverse)

  const { data: reversedRow } = await fin.from('transactions').select('status').eq('id', toReverse.data.transaction_id).single()
  check('отменённая операция осталась в истории со статусом', reversedRow?.status, 'reversed')

  /* §17.12 — исправление 6 000 → 6 500 */
  const beforeCorrect = await balance(rub.id)
  const original = await post({
    idempotency_key: 'to-correct', kind: 'expense', occurred_at: new Date().toISOString(),
    movements: [{ account_id: rub.id, amount_minor: -600_000, currency: 'RUB' }],
  })
  const correctKey = `${TAG}:corrected`
  created.keys.push(correctKey, `correct-reverse:${original.data.transaction_id}:${correctKey}`)
  const { error: corErr } = await fin.rpc('correct_transaction', {
    p_transaction: original.data.transaction_id,
    p: {
      idempotency_key: correctKey, kind: 'expense', occurred_at: new Date().toISOString(),
      movements: [{ account_id: rub.id, amount_minor: -650_000, currency: 'RUB' }],
    },
  })
  if (corErr) throw new Error(`исправление не прошло: ${corErr.message}`)
  check('§17.12 исправление 6 000 → 6 500 списывает ровно 6 500', await balance(rub.id), beforeCorrect - 650_000)

  const { data: chain } = await fin.from('transactions')
    .select('id, version, status')
    .eq('correction_group_id', (await fin.from('transactions').select('correction_group_id').eq('id', original.data.transaction_id).single()).data.correction_group_id)
  check('§17.12 в истории три редакции: исходная, отмена, новая', chain?.length, 3)

  /* Журнал движений должен объяснять остаток целиком */
  const { data: movements } = await fin.from('movements').select('amount_minor').eq('account_id', rub.id)
  const sum = (movements ?? []).reduce((s: number, m: any) => s + Number(m.amount_minor), 0)
  check('остаток сходится с журналом движений', await balance(rub.id), 10_000_000 + sum)

  console.log('─'.repeat(78))
  console.log(failures === 0 ? '✓ расхождений нет' : `✗ провалено проверок: ${failures}`)
}

/** Уборка: тестовые деньги не должны остаться в боевой базе. */
async function cleanup() {
  if (!created.accounts.length) return
  const { data: movs } = await fin.from('movements').select('transaction_id').in('account_id', created.accounts)
  const txIds = [...new Set((movs ?? []).map((m: any) => m.transaction_id))]
  if (txIds.length) {
    await fin.from('settlements').delete().in('transaction_id', txIds)
    await fin.from('movements').delete().in('transaction_id', txIds)
    await fin.from('audit_events').delete().in('entity_id', txIds)
    // Сначала снимаем ссылки отмен друг на друга, иначе внешний ключ не даст удалить
    await fin.from('transactions').update({ reverses_id: null }).in('id', txIds)
    await fin.from('transactions').delete().in('id', txIds)
  }
  await fin.from('accounts').delete().in('id', created.accounts)
  await fin.from('idempotency_keys').delete().in('key', created.keys)
  console.log(`убрано: счетов ${created.accounts.length}, операций ${txIds.length}`)
}

main()
  .catch((e) => { console.error('\n✗ самопроверка прервалась:', e.message); failures++ })
  .finally(async () => {
    await cleanup().catch((e) => console.error('не удалось убрать за собой:', e.message))
    process.exit(failures === 0 ? 0 : 1)
  })
