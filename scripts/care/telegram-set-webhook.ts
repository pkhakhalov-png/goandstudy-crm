// Вебхук care-бота: повесить, показать, снять.
//
//   npx tsx scripts/care/telegram-set-webhook.ts --адрес https://<branch-alias>
//   npx tsx scripts/care/telegram-set-webhook.ts --показать
//   npx tsx scripts/care/telegram-set-webhook.ts --снять
//
// Аргументы (любой можно не указывать — возьмётся из .env.local):
//   --адрес  <url>      базовый адрес деплоя, без пути
//   --токен  <token>    токен care-бота          (иначе CARE_TELEGRAM_BOT_TOKEN)
//   --секрет <secret>   секрет вебхука           (иначе CARE_TELEGRAM_WEBHOOK_SECRET)
//   --обход  <secret>   Protection Bypass Vercel (иначе CARE_VERCEL_BYPASS)
//
// ПОРЯДОК ВАЖЕН, и он обратный тому, что был со старым ботом. Там проверка
// подписи включалась переменной, поэтому сначала настраивали Телеграм, потом
// переменную. Здесь маршрут без секрета не работает вовсе (отвечает 500),
// поэтому сначала переменные в Vercel, потом этот скрипт. Иначе Телеграм
// получит серию 500 и уйдёт в паузу между попытками.
//
// Старого бота скрипт не трогает: он работает только с токеном care-бота.
import { config } from 'dotenv'
import path from 'path'

config({ path: path.resolve(process.cwd(), '.env.local') })

/** Значение именованного аргумента. Поддерживает и `--имя знач`, и `--имя=знач`. */
function аргумент(имя: string): string | null {
  const точный = process.argv.indexOf(`--${имя}`)
  if (точный > -1 && process.argv[точный + 1] && !process.argv[точный + 1].startsWith('--')) {
    return process.argv[точный + 1]
  }
  const сРавно = process.argv.find((a) => a.startsWith(`--${имя}=`))
  return сРавно ? сРавно.slice(имя.length + 3) : null
}

function есть(имя: string): boolean {
  return process.argv.includes(`--${имя}`)
}

/** Аргумент важнее переменной окружения: так можно проверить чужой деплой, не трогая .env.local. */
function значение(имяАргумента: string, имяПеременной: string): string | null {
  const изАргумента = аргумент(имяАргумента)
  if (изАргумента) return изАргумента.trim()
  const изОкружения = process.env[имяПеременной]
  return изОкружения && изОкружения.trim() ? изОкружения.trim() : null
}

const ТОКЕН = значение('токен', 'CARE_TELEGRAM_BOT_TOKEN')
const СЕКРЕТ = значение('секрет', 'CARE_TELEGRAM_WEBHOOK_SECRET')
const ОБХОД = значение('обход', 'CARE_VERCEL_BYPASS')

async function позвать(метод: string, тело?: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${ТОКЕН}/${метод}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(тело ?? {}),
  })
  const ответ = (await res.json()) as { ok: boolean; result?: unknown; description?: string }
  if (!ответ.ok) throw new Error(`${метод}: ${ответ.description ?? 'неизвестная ошибка'}`)
  return ответ.result as Record<string, unknown>
}

function требуетсяТокен() {
  if (ТОКЕН) return
  console.error('Нет токена. Передай --токен <token> или положи CARE_TELEGRAM_BOT_TOKEN в .env.local.')
  console.error('Это токен ОТДЕЛЬНОГО бота контура v2, не того, что работает с клиентами сейчас.')
  console.error('Как его завести — docs/care/OWNER_SETUP.md, шаг 1.')
  process.exit(1)
}

/**
 * Проверка адреса до того, как отдать его Телеграму.
 *
 * Вебхук, повешенный на недоступный адрес, выглядит как «настроено», а
 * работает как «сообщения пропадают». Отличить это потом дорого: Телеграм про
 * свои неудачи рассказывает только в getWebhookInfo, и то последнюю.
 */
async function проверитьАдрес(адрес: string) {
  const заголовки: Record<string, string> = { 'Content-Type': 'application/json' }
  // Для нашей пробы обход можно послать заголовком — это чище, чем в адресе.
  if (ОБХОД) заголовки['x-vercel-protection-bypass'] = ОБХОД

  const проба = await fetch(адрес, {
    method: 'POST',
    headers: заголовки,
    body: '{}',
    redirect: 'manual',
  })
  const тело = await проба.text().catch(() => '')

  // ЗАЩИТА ДЕПЛОЯ. Проверено 28.09.2026: на превью-адресах проекта включена
  // Vercel Deployment Protection, и она отвечает раньше нашего кода — 302 на
  // vercel.com/sso-api для GET и 401 для POST.
  //
  // Различать обязательно. Наш маршрут тоже отвечает 401 — когда не сошёлся
  // секрет. Спутать их значит повесить вебхук на адрес, куда Телеграм не
  // достучится никогда: пройти SSO Vercel он не умеет.
  //
  // Отличаем по телу: наш маршрут отвечает JSON с полем ok, защита — нет.
  const местоНазначения = проба.headers.get('location') ?? ''
  const этоЗащита =
    местоНазначения.includes('vercel.com/sso-api') ||
    ((проба.status === 401 || проба.status === 403) && !тело.includes('"ok"'))

  if (этоЗащита) {
    console.error(`✗ адрес закрыт защитой деплоя Vercel (ответ ${проба.status}), наш код не выполняется.`)
    if (ОБХОД) {
      console.error('  Секрет обхода передан, но не принят — проверь, что он скопирован целиком')
      console.error('  и что это именно Protection Bypass for Automation, а не что-то другое.')
    } else {
      console.error('')
      console.error('  Телеграм пройти SSO Vercel не умеет — вебхук на этот адрес работать не будет.')
      console.error('  Заведи Protection Bypass for Automation и передай: --обход <секрет>')
      console.error('  Пошагово — docs/care/OWNER_SETUP.md, шаг 2.')
    }
    process.exit(1)
  }

  if (проба.status === 404) {
    console.error(`✗ по адресу ${адрес} маршрута нет (404). Деплой ветки не выкачен?`)
    process.exit(1)
  }
  if (проба.status === 500) {
    console.error('✗ маршрут отвечает 500: CARE_TELEGRAM_WEBHOOK_SECRET не задан в окружении деплоя.')
    console.error('  Переменные заводятся в Vercel — docs/care/OWNER_SETUP.md, шаг 3.')
    process.exit(1)
  }
  if (проба.status !== 401) {
    console.error(`✗ неожиданный ответ ${проба.status}. Ожидался 401: маршрут обязан отвергать запрос без секрета.`)
    console.error(`  Тело: ${тело.slice(0, 200)}`)
    process.exit(1)
  }

  console.log('  проба адреса: 401 — маршрут жив и требует секрет, верно')
}

async function main() {
  if (есть('показать')) {
    требуетсяТокен()
    console.log(JSON.stringify(await позвать('getWebhookInfo'), null, 2))
    return
  }

  if (есть('снять')) {
    требуетсяТокен()
    await позвать('deleteWebhook', { drop_pending_updates: false })
    console.log('✓ вебхук снят. Накопленные события не выброшены — придут после следующей установки.')
    return
  }

  // Адрес можно дать и позиционно: короче в наборе, а перепутать не с чем.
  const базовый = аргумент('адрес') ?? process.argv.find((a) => a.startsWith('https://')) ?? null
  if (!базовый) {
    console.error('Укажи адрес: --адрес https://<branch-alias>')
    console.error('Остальные ключи: --токен, --секрет, --обход, --показать, --снять')
    process.exit(1)
  }

  требуетсяТокен()

  if (!СЕКРЕТ || СЕКРЕТ.length < 16) {
    console.error('Нет годного секрета вебхука (нужно не короче 16 символов).')
    console.error('Передай --секрет <secret> или положи CARE_TELEGRAM_WEBHOOK_SECRET в .env.local.')
    console.error('Маршрут без него отвечает 500 — вешать вебхук рано.')
    process.exit(1)
  }

  // Секрет обхода уходит в адрес параметром: заголовок Телеграму не задать, а
  // параметр он сохранит и будет присылать при каждой доставке.
  const хвост = ОБХОД
    ? `?x-vercel-protection-bypass=${encodeURIComponent(ОБХОД)}&x-vercel-set-bypass-cookie=true`
    : ''
  const адрес = `${базовый.replace(/\/+$/, '')}/api/care/webhooks/telegram`

  await проверитьАдрес(адрес)

  await позвать('setWebhook', {
    url: `${адрес}${хвост}`,
    secret_token: СЕКРЕТ,
    // Пока контур только принимает: сообщения и правки. Остальное не нужно.
    allowed_updates: ['message', 'edited_message', 'channel_post'],
    drop_pending_updates: false,
  })

  const инфо = await позвать('getWebhookInfo')
  // Адрес печатаем без хвоста: в нём секрет обхода, а вывод команды попадает
  // в историю терминала и в переписку.
  console.log(`\n✓ вебхук care-бота: ${адрес}${ОБХОД ? ' (+ секрет обхода в параметрах)' : ''}`)
  console.log(`  ожидает доставки: ${инфо.pending_update_count ?? 0}`)
  if (инфо.last_error_message) console.log(`  последняя ошибка: ${инфо.last_error_message}`)
  console.log('\nСтарый бот не затронут: скрипт работает только с токеном care-бота.')
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e)
  process.exit(1)
})
