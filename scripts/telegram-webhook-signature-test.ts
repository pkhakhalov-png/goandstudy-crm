// Подпись вебхука клиентских чатов.
//
//   npx tsx scripts/telegram-webhook-signature-test.ts
//
// Это действующая часть CRM: сюда приходят сообщения клиентов по сделкам.
// Ошибка здесь означает либо молчащие чаты, либо открытую дверь, поэтому
// проверяется каждая ветка, включая переходную.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { подписьВерна } from '../app/api/telegram/webhook/route'

let passed = 0, failed = 0
function ok(name: string, cond: boolean, note = '') {
  if (cond) { passed++; console.log(`✓ ${name}${note ? ' — ' + note : ''}`) }
  else { failed++; console.log(`✗ ${name}${note ? ' — ' + note : ''}`) }
}

const запрос = (заголовок?: string) => ({
  headers: { get: (n: string) => (n === 'x-telegram-bot-api-secret-token' ? заголовок ?? null : null) },
})

const было = process.env.TELEGRAM_WEBHOOK_SECRET

function main() {
  // Переходное состояние: секрета нет — пропускаем, как раньше.
  delete process.env.TELEGRAM_WEBHOOK_SECRET
  ok('без переменной поведение прежнее — чаты не замолкают',
    подписьВерна(запрос()).ok,
    'проверку выкатываем, не останавливая работающее')

  // Секрет задан — заголовок обязателен.
  process.env.TELEGRAM_WEBHOOK_SECRET = 'sekret-klientskih-chatov-7f3a'
  ok('с переменной запрос без заголовка отклоняется', !подписьВерна(запрос()).ok,
    'ровно та дыра, что была на проде: HTTP 200 на запрос без подписи')
  ok('чужой заголовок отклоняется', !подписьВерна(запрос('chuzhoy')).ok)
  ok('свой заголовок принимается', подписьВерна(запрос('sekret-klientskih-chatov-7f3a')).ok)

  // Негодный секрет не превращается в «пропускаем всех».
  process.env.TELEGRAM_WEBHOOK_SECRET = 'секрет-по-русски'
  const негодный = подписьВерна(запрос('секрет-по-русски'))
  ok('негодный секрет закрывает дверь, а не открывает', !негодный.ok,
    негодный.ok ? '' : негодный.причина)
  ok('и причина названа', !негодный.ok && /не годится/.test(негодный.причина))

  if (было === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET
  else process.env.TELEGRAM_WEBHOOK_SECRET = было

  console.log(`\n${passed} пройдено, ${failed} провалено`)
  process.exit(failed ? 1 : 0)
}
main()
