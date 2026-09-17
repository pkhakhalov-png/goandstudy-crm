// Включить проверку подписи у вебхука клиентских чатов.
//
//   npx tsx scripts/telegram-set-webhook.ts            # показать, что стоит сейчас
//   npx tsx scripts/telegram-set-webhook.ts --apply    # задать секрет
//
// ПОРЯДОК ВАЖЕН, иначе клиентские чаты замолчат:
//
//   1. Сначала этот скрипт с --apply. Телеграм начинает слать заголовок,
//      код его пока игнорирует — ничего не меняется.
//   2. Потом TELEGRAM_WEBHOOK_SECRET в окружении Vercel и передеплой.
//      Код начинает требовать заголовок, который уже приходит.
//
// Обратный порядок даёт промежуток, в котором мы требуем то, чего ещё не шлют.
import { config } from 'dotenv'; import path from 'path'
import crypto from 'node:crypto'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { секретГодится } from '../lib/webhook-secret'

const APPLY = process.argv.includes('--apply')
const API = 'https://api.telegram.org'

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) { console.log('нет TELEGRAM_BOT_TOKEN — нечего настраивать'); process.exit(2) }

  const info = await (await fetch(`${API}/bot${token}/getWebhookInfo`)).json() as any
  if (!info.ok) { console.log('не удалось прочитать настройки:', info.description); process.exit(1) }

  const r = info.result
  console.log('сейчас:')
  console.log(`  адрес: ${r.url || '(не задан)'}`)
  console.log(`  ждут доставки: ${r.pending_update_count ?? 0}`)
  console.log(`  секрет задан: ${r.has_custom_certificate === undefined ? '—' : ''}${typeof r.secret_token_set === 'boolean' ? (r.secret_token_set ? 'да' : 'нет') : 'не сообщается'}`)
  if (r.last_error_message) console.log(`  последняя ошибка: ${r.last_error_message} (${new Date((r.last_error_date ?? 0) * 1000).toISOString()})`)

  if (!r.url) {
    console.log('\nадрес вебхука не задан — видимо, бот работает опросом. Секрет тут не нужен.')
    process.exit(0)
  }

  // Секрет из окружения, если он уже выбран; иначе новый случайный.
  // Латиница и цифры: в заголовок HTTP кириллица не помещается.
  const секрет = process.env.TELEGRAM_WEBHOOK_SECRET || crypto.randomBytes(24).toString('base64url')
  const годность = секретГодится(секрет)
  if (!годность.ok) { console.log(`\nсекрет не годится: ${годность.почему}`); process.exit(1) }

  if (!APPLY) {
    console.log('\nрежим показа. Что произойдёт с --apply:')
    console.log(`  setWebhook на тот же адрес ${r.url} с секретом`)
    console.log(`  секрет: ${process.env.TELEGRAM_WEBHOOK_SECRET ? 'из окружения' : 'новый, будет напечатан один раз'}`)
    console.log('\nдальше: положить секрет в TELEGRAM_WEBHOOK_SECRET на Vercel и передеплоить')
    process.exit(0)
  }

  const res = await (await fetch(`${API}/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // Адрес НЕ меняем — берём тот, что стоит. Сменить адрес заодно с секретом
    // значит поменять две вещи разом и не понять, какая сломалась.
    body: JSON.stringify({ url: r.url, secret_token: секрет }),
  })).json() as any

  if (!res.ok) { console.log('не получилось:', res.description); process.exit(1) }

  console.log('\nсекрет задан у Телеграма. Код его пока игнорирует — ничего не изменилось.')
  if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
    console.log('\nСЕКРЕТ (сохрани, больше не покажу):')
    console.log(`  ${секрет}`)
  }
  console.log('\nТеперь: положить его в TELEGRAM_WEBHOOK_SECRET на Vercel и передеплоить.')
  console.log('После этого запросы без заголовка будут отклоняться.')
}
main()
