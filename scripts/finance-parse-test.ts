/**
 * Проверка разбора сообщений: npx tsx scripts/finance-parse-test.ts
 *
 * Набор из PRD §16 — типовые по формулировке, но безопасные примеры. Смысл не в
 * том, чтобы разобрать всё: смысл в том, чтобы неоднозначное честно попадало в
 * уточнение, а не угадывалось. Поэтому половина случаев здесь — про отказ.
 *
 * База не нужна: проверяются только правила.
 */
import { parseOne, parseMessage } from '../lib/finance/parse'
import { KIND_NAMES } from '../lib/finance/kinds'

const ctx = {
  categories: ['Оплаты клиентов', 'Профориентация', 'Кураторы и сопровождение', 'Зарплаты',
    'Реклама', 'Сервисы и подписки', 'Переводы документов', 'Комиссии', 'Офис и связь', 'Прочие расходы'],
  aliases: { 'оля': 'Ольга Петрова', 'ольга': 'Ольга Петрова', 'чикина': 'Чикина' },
  now: new Date('2026-09-15T12:00:00Z'),
}

type Expect = {
  kind?: string
  minor?: number | null
  currency?: string | null
  category?: string | null
  counterparty?: string | null
  asks?: boolean
}

const CASES: [string, Expect][] = [
  ['Расход профориентолог 6000',            { kind: 'expense', minor: 600_000, category: 'Профориентация' }],
  ['Зарплата Ольга 30 000',                 { kind: 'expense', minor: 3_000_000, category: 'Зарплаты', counterparty: 'Ольга Петрова' }],
  ['Оле зарплата 30 тысяч',                 { kind: 'expense', minor: 3_000_000, counterparty: 'Ольга Петрова' }],
  ['Пришло от Чикиной 22 170',              { kind: 'income', minor: 2_217_000, counterparty: 'Чикина' }],
  ['Оплата клиента 96 700',                 { kind: 'income', minor: 9_670_000, category: 'Оплаты клиентов' }],
  ['Реклама 15 000',                        { kind: 'expense', minor: 1_500_000, category: 'Реклама' }],
  ['Потратил на сервисы 20 долларов',       { kind: 'expense', minor: 2_000, currency: 'USD', category: 'Сервисы и подписки' }],
  ['Оплатил подписку 49$',                  { kind: 'expense', minor: 4_900, currency: 'USD' }],
  ['Комиссия банка 500',                    { kind: 'fee', minor: 50_000, category: 'Комиссии' }],
  ['Вернули нам 100 долларов за подписку',  { kind: 'refund_in', minor: 10_000, currency: 'USD' }],
  ['Вернули клиенту 50 тысяч',              { kind: 'refund_out', minor: 5_000_000 }],
  ['Внёс своих 100 тысяч',                  { kind: 'founder_contribution', minor: 10_000_000 }],
  ['Забрал себе 50 тысяч',                  { kind: 'founder_withdrawal', minor: 5_000_000 }],
  ['Перевёл 90 000 на долларовую карту',    { kind: 'transfer', minor: 9_000_000 }],
  ['Вчера офис 35 000',                     { kind: 'expense', minor: 3_500_000, category: 'Офис и связь' }],
  ['12 сентября реклама 15 000',            { kind: 'expense', minor: 1_500_000 }],

  // Дальше — то, что обязано спрашивать, а не угадывать
  ['Реклама 15',                            { asks: true }],
  ['Оплатил профориентологу',               { asks: true }],
  ['Зарплата Оле 30',                       { asks: true }],
  ['Привет, как дела?',                     { asks: true }],
]

let failed = 0

function check(name: string, ok: boolean, detail?: string) {
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`)
}

console.log(`РАЗБОР СООБЩЕНИЙ · ${CASES.length} случаев\n${'─'.repeat(78)}`)

for (const [text, want] of CASES) {
  const c = parseOne(text, ctx)
  const asks = c.unresolved.length > 0 || c.amountMinor === null

  if (want.asks) {
    check(`«${text}» → уточнение`, asks, asks ? '' : `разобрал как ${KIND_NAMES[c.kind]} ${c.amountMinor}`)
    continue
  }

  const problems: string[] = []
  if (asks) problems.push(`ушло в уточнение: ${c.question ?? c.unresolved.join(', ')}`)
  if (want.kind && c.kind !== want.kind) problems.push(`тип ${c.kind}, ждали ${want.kind}`)
  if (want.minor !== undefined && c.amountMinor !== want.minor) problems.push(`сумма ${c.amountMinor}, ждали ${want.minor}`)
  if (want.currency !== undefined && c.currency !== want.currency) problems.push(`валюта ${c.currency}, ждали ${want.currency}`)
  if (want.category !== undefined && c.categoryHint !== want.category) problems.push(`категория ${c.categoryHint}, ждали ${want.category}`)
  if (want.counterparty !== undefined && c.counterpartyHint !== want.counterparty) problems.push(`контрагент ${c.counterpartyHint}, ждали ${want.counterparty}`)

  check(`«${text}»`, problems.length === 0, problems.join('; '))
}

// Несколько операций одним сообщением
const many = parseMessage('Зарплата Оле 30 тысяч\nРеклама 15 000\nСервисы 20 долларов', ctx)
check('три операции в одном сообщении разобраны как три', many.length === 3, `получилось ${many.length}`)
check('все три однозначны', many.every((c) => c.unresolved.length === 0),
  many.filter((c) => c.unresolved.length).map((c) => c.note).join(' | '))

// Дата
const yesterday = parseOne('вчера реклама 15 000', ctx)
check('«вчера» отнимает день',
  yesterday.occurredAt.slice(0, 10) === '2026-09-14', yesterday.occurredAt)

console.log('─'.repeat(78))
console.log(failed === 0 ? '✓ все случаи разобраны как ожидалось' : `✗ расхождений: ${failed}`)
process.exit(failed === 0 ? 0 : 1)
