// Повесить вебхук care-бота на адрес контура v2.
//
//   npx tsx scripts/care/telegram-set-webhook.ts https://<branch-alias>.vercel.app
//   npx tsx scripts/care/telegram-set-webhook.ts --показать     # текущее состояние, не менять
//   npx tsx scripts/care/telegram-set-webhook.ts --снять        # убрать вебхук
//
// ПОРЯДОК ВАЖЕН, и он обратный тому, что был со старым ботом. Там проверка
// подписи включалась переменной, поэтому сначала настраивали Телеграм, потом
// переменную. Здесь маршрут без секрета не работает вовсе (отвечает 500),
// поэтому сначала переменные в Vercel, потом этот скрипт. Иначе Телеграм
// получит серию 500 и уйдёт в паузу между попытками.
//
// Старого бота скрипт не трогает: он работает только с CARE_TELEGRAM_BOT_TOKEN.
import { config } from 'dotenv'
import path from 'path'

config({ path: path.resolve(process.cwd(), '.env.local') })

const ТОКЕН = process.env.CARE_TELEGRAM_BOT_TOKEN
const СЕКРЕТ = process.env.CARE_TELEGRAM_WEBHOOK_SECRET

async function позвать(метод: string, тело?: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${ТОКЕН}/${метод}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(тело ?? {}),
  })
  const ответ = await res.json()
  if (!ответ.ok) throw new Error(`${метод}: ${ответ.description ?? 'неизвестная ошибка'}`)
  return ответ.result
}

async function main() {
  if (!ТОКЕН) {
    console.error('Нет CARE_TELEGRAM_BOT_TOKEN в .env.local. Это токен ОТДЕЛЬНОГО бота контура v2,')
    console.error('не того, что работает с клиентами сейчас. Создаётся в BotFather.')
    process.exit(1)
  }

  const аргумент = process.argv[2]

  if (аргумент === '--показать') {
    const инфо = await позвать('getWebhookInfo')
    console.log(JSON.stringify(инфо, null, 2))
    return
  }

  if (аргумент === '--снять') {
    await позвать('deleteWebhook', { drop_pending_updates: false })
    console.log('✓ вебхук снят. Накопленные события не выброшены — придут после следующей установки.')
    return
  }

  if (!аргумент || !/^https:\/\//.test(аргумент)) {
    console.error('Укажи базовый адрес: npx tsx scripts/care/telegram-set-webhook.ts https://<адрес>')
    process.exit(1)
  }

  if (!СЕКРЕТ || СЕКРЕТ.trim().length < 16) {
    console.error('Нет годного CARE_TELEGRAM_WEBHOOK_SECRET (нужно не короче 16 символов).')
    console.error('Маршрут без него отвечает 500 — вешать вебхук рано.')
    process.exit(1)
  }

  const адрес = `${аргумент.replace(/\/+$/, '')}/api/care/webhooks/telegram`

  // Проверяем, что по адресу вообще кто-то есть, до того как отдать его
  // Телеграму. Вебхук, повешенный на несуществующий адрес, выглядит как
  // «настроено», а работает как «сообщения пропадают».
  const проба = await fetch(адрес, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  if (проба.status === 404) {
    console.error(`✗ по адресу ${адрес} маршрута нет (404). Деплой ветки не выкачен?`)
    process.exit(1)
  }
  if (проба.status === 500) {
    console.error(`✗ маршрут отвечает 500: CARE_TELEGRAM_WEBHOOK_SECRET не задан в окружении деплоя.`)
    process.exit(1)
  }
  // 401 — то, что нужно: маршрут жив и отвергает запрос без правильного заголовка.
  console.log(`  проба адреса: ${проба.status} ${проба.status === 401 ? '(маршрут жив и требует секрет — верно)' : ''}`)

  await позвать('setWebhook', {
    url: адрес,
    secret_token: СЕКРЕТ,
    // Пока контур только принимает: сообщения и правки. Остальное не нужно.
    allowed_updates: ['message', 'edited_message', 'channel_post'],
    drop_pending_updates: false,
  })

  const инфо = await позвать('getWebhookInfo')
  console.log(`\n✓ вебхук care-бота: ${инфо.url}`)
  console.log(`  ожидает доставки: ${инфо.pending_update_count ?? 0}`)
  if (инфо.last_error_message) console.log(`  последняя ошибка: ${инфо.last_error_message}`)
  console.log('\nСтарый бот не затронут: скрипт работает только с CARE_TELEGRAM_BOT_TOKEN.')
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e)
  process.exit(1)
})
