/**
 * Подключение финансового бота к вебхуку.
 *
 *   npx tsx scripts/finance-telegram-setup.ts          — показать состояние
 *   npx tsx scripts/finance-telegram-setup.ts --set    — прописать вебхук
 *
 * Токен и секрет читаются из .env.local и никуда не печатаются: в выводе видно
 * только имя бота и адрес вебхука.
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

const URL_ = process.env.FINANCE_WEBHOOK_URL || 'https://crm.goandstudy.com/api/finance/telegram'

async function main() {
  const { tgGetMe, tgGetWebhookInfo, tgSetWebhook, financeBotToken } = await import('../lib/finance/telegram')

  if (!financeBotToken()) {
    console.log('✗ нет TELEGRAM_FINANCE_BOT_TOKEN в .env.local')
    process.exit(1)
  }

  const me = await tgGetMe()
  if (!me?.username) {
    console.log('✗ Telegram не принял токен — проверьте, что скопирован целиком')
    process.exit(1)
  }
  console.log(`бот: @${me.username}`)

  const secret = process.env.TELEGRAM_FINANCE_WEBHOOK_SECRET
  if (!secret || secret.length < 16) {
    console.log('✗ нужен TELEGRAM_FINANCE_WEBHOOK_SECRET длиной хотя бы 16 символов')
    console.log('  сгенерировать: openssl rand -hex 24')
    process.exit(1)
  }

  if (process.argv.includes('--set')) {
    const ok = await tgSetWebhook(URL_, secret)
    console.log(ok ? `✓ вебхук прописан: ${URL_}` : '✗ Telegram не принял вебхук')
  }

  const info: any = await tgGetWebhookInfo()
  if (info) {
    console.log(`вебхук сейчас: ${info.url || '— не задан —'}`)
    console.log(`ожидает доставки: ${info.pending_update_count ?? 0}`)
    if (info.last_error_message) {
      console.log(`последняя ошибка: ${info.last_error_message} (${new Date((info.last_error_date ?? 0) * 1000).toLocaleString('ru-RU')})`)
    }
  }
}
main()
