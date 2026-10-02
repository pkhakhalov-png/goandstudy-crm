// Переезд контура на боевой адрес — проверка и переключение.
//
//   npx tsx scripts/care/go-prod.ts                        # что готово, чего нет
//   npx tsx scripts/care/go-prod.ts --переключить --применить
//   npx tsx scripts/care/go-prod.ts --вернуть --применить  # обратно на превью
//
// ЗАЧЕМ. Раздел 7 плана: «мерж в main, переменные CARE_* в Production,
// setWebhook care-бота на боевой адрес, care.settings.tick_url на боевой адрес,
// проверка health». Четыре вещи в четырёх разных местах, и ни одна не сообщает
// о себе, если сделать не всё.
//
// Сломается это молча и худшим образом: расписание продолжит звать превью,
// которого после удаления ветки не будет; Телеграм продолжит слать события
// туда же. Ошибок никто не увидит — просто перестанут приходить сообщения и
// готовиться напоминания. На сутки это выглядит как спокойный день.
//
// ПОЧЕМУ ПЕРЕКЛЮЧЕНИЕ ОТКАЗЫВАЕТ. Пока боевой адрес не отвечает и не все
// переменные на месте, переключать адреса нельзя: это ровно тот способ
// получить тишину. Сначала мерж и выкладка, потом адреса.
//
// ПОЧЕМУ ЕСТЬ ВОЗВРАТ. Переезд должен быть обратимым, как и всё остальное в
// контуре: если на бою что-то не так, вернуть адреса на превью — одна команда.
import { config } from 'dotenv'
import path from 'path'

// Правило переезда живёт в lib: ошибка в нём не заметна, и проверять его надо
// тестом, а не глазами при каждом переезде.
import { БОЕВОЙ, наБою, можноПереключать, адресаДля } from '../../lib/care/move'

config({ path: path.resolve(process.cwd(), '.env.local') })

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const KEY = process.env.CARE_DB_KEY
const СЕКРЕТ = process.env.CARE_TICK_SECRET
const ТОКЕН_БОТА = process.env.CARE_TELEGRAM_BOT_TOKEN
const СЕКРЕТ_ВЕБХУКА = process.env.CARE_TELEGRAM_WEBHOOK_SECRET
const ОБХОД = process.env.CARE_VERCEL_BYPASS

const есть = (имя: string) => process.argv.includes(`--${имя}`)

async function запросCare<T>(метод: string, путь: string, тело?: unknown): Promise<T[]> {
  const h: Record<string, string> = {
    apikey: ANON!,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    [метод === 'GET' ? 'Accept-Profile' : 'Content-Profile']: 'care',
  }
  if (метод !== 'GET') h.Prefer = 'return=representation'
  const r = await fetch(`${SUPA}/rest/v1/${путь}`, {
    method: метод,
    headers: h,
    body: тело ? JSON.stringify(тело) : undefined,
  })
  const текст = await r.text()
  if (!r.ok) throw new Error(`${метод} ${путь} → ${r.status}: ${текст.slice(0, 200)}`)
  return текст ? (JSON.parse(текст) as T[]) : []
}

type Пункт = { готов: boolean; что: string; подсказка?: string }

/** Отвечает ли боевой адрес и что он о себе говорит. */
async function боевойЖив(): Promise<{ пункт: Пункт; нехватает: string[] }> {
  try {
    const r = await fetch(`${БОЕВОЙ}/api/care/health`, {
      headers: СЕКРЕТ ? { 'x-care-tick-secret': СЕКРЕТ } : {},
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    })

    if (r.status >= 300 && r.status < 400) {
      return {
        пункт: {
          готов: false,
          что: 'боевой адрес отвечает на /api/care/health',
          подсказка: `пришёл редирект ${r.status} — кода контура на бою нет, нужен мерж в main`,
        },
        нехватает: [],
      }
    }

    const тело = (await r.json()) as {
      ok?: boolean
      mode?: string
      external_sends?: boolean
      env_missing?: string[]
      db_error?: string | null
    }

    if (!тело.ok) {
      return {
        пункт: {
          готов: false,
          что: 'боевой адрес отвечает на /api/care/health',
          подсказка: `health говорит ok=false${тело.db_error ? `: ${тело.db_error}` : ''}`,
        },
        нехватает: тело.env_missing ?? [],
      }
    }

    return {
      пункт: {
        готов: true,
        что: `боевой адрес жив: режим ${тело.mode}, отправки ${тело.external_sends ? 'разрешены' : 'закрыты'}`,
      },
      // Список недостающего приходит только с секретом. Без него мы его не
      // видим — и честнее сказать «не проверено», чем «всё на месте».
      нехватает: тело.env_missing ?? [],
    }
  } catch (e) {
    return {
      пункт: {
        готов: false,
        что: 'боевой адрес отвечает на /api/care/health',
        подсказка: `не ответил: ${e instanceof Error ? e.message : String(e)}`,
      },
      нехватает: [],
    }
  }
}

async function состояниеАдресов() {
  const [строка] = await запросCare<{ value: string }>('GET', 'settings?select=value&key=eq.tick_url')
  const tick = String(строка?.value ?? '')

  let вебхук = ''
  if (ТОКЕН_БОТА) {
    const r = await fetch(`https://api.telegram.org/bot${ТОКЕН_БОТА}/getWebhookInfo`)
    const j = (await r.json()) as { result?: { url?: string } }
    вебхук = j.result?.url ?? ''
  }
  return { tick, вебхук }
}

async function проверить(): Promise<{ пункты: Пункт[]; готовКПереезду: boolean }> {
  const { пункт: живой, нехватает } = await боевойЖив()
  const { tick, вебхук } = await состояниеАдресов()

  const пункты: Пункт[] = [живой]

  if (живой.готов) {
    пункты.push({
      готов: нехватает.length === 0,
      что:
        нехватает.length === 0
          ? 'переменные контура на бою на месте'
          : `на бою не хватает переменных: ${нехватает.join(', ')}`,
      подсказка: нехватает.length
        ? 'добавить их в Vercel со scope Production и выложить заново'
        : undefined,
    })
  }

  пункты.push({
    готов: наБою(tick),
    что: `адрес воркера: ${tick ? (наБою(tick) ? 'боевой' : 'превью') : 'не записан'}`,
    подсказка: наБою(tick) ? undefined : 'переключается этим же скриптом: --переключить --применить',
  })

  пункты.push({
    готов: наБою(вебхук),
    что: `вебхук бота: ${вебхук ? (наБою(вебхук) ? 'боевой' : 'превью') : 'не поставлен'}`,
    подсказка: наБою(вебхук) ? undefined : 'переключается этим же скриптом: --переключить --применить',
  })

  return { пункты, готовКПереезду: можноПереключать(живой.готов, нехватает).можно }
}

async function переключить(применить: boolean, обратно: boolean) {
  const { пункт: живой, нехватает } = await боевойЖив()
  const решение = можноПереключать(живой.готов, нехватает, обратно)

  if (!решение.можно) {
    console.error(`\n✗ Переключать рано: ${решение.почему}`)
    console.error('  Иначе расписание и Телеграм будут звать то, чего нет, — и это не даст')
    console.error('  ни одной ошибки, только тишину.')
    process.exit(1)
  }

  const { tick, вебхук } = адресаДля(обратно, ОБХОД)

  console.log(`\n${применить ? 'ПЕРЕКЛЮЧАЮ' : 'ПРЕДПРОСМОТР'} на ${обратно ? 'превью' : 'боевой адрес'}:`)
  console.log(`  воркер → ${tick.replace(/bypass=[^&]+/, 'bypass=…')}`)
  console.log(`  вебхук → ${вебхук.replace(/bypass=[^&]+/, 'bypass=…')}`)

  if (!применить) {
    console.log('\nЭто предпросмотр. Чтобы переключить, добавь --применить')
    return
  }

  await запросCare('PATCH', 'settings?key=eq.tick_url', { value: tick })

  if (!ТОКЕН_БОТА) {
    console.error('\n✗ Нет CARE_TELEGRAM_BOT_TOKEN — вебхук не переставлен, адрес воркера переставлен.')
    process.exit(1)
  }

  const r = await fetch(`https://api.telegram.org/bot${ТОКЕН_БОТА}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: вебхук,
      secret_token: СЕКРЕТ_ВЕБХУКА,
      // Старые события не теряем: Телеграм доставит их на новый адрес.
      drop_pending_updates: false,
    }),
  })
  const ответ = (await r.json()) as { ok: boolean; description?: string }
  if (!ответ.ok) {
    console.error(`\n✗ Вебхук не переставлен: ${ответ.description}`)
    console.error('  Адрес воркера при этом уже боевой — верните его или повторите команду.')
    process.exit(1)
  }

  console.log('\n✓ Готово. Проверьте состояние ещё раз: npx tsx scripts/care/go-prod.ts')
}

async function main() {
  if (!SUPA || !ANON || !KEY) {
    console.error('Нужны NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY и CARE_DB_KEY')
    process.exit(1)
  }

  if (есть('переключить') || есть('вернуть')) {
    return переключить(есть('применить'), есть('вернуть'))
  }

  const { пункты, готовКПереезду } = await проверить()

  console.log('\nПереезд на боевой адрес:\n')
  for (const п of пункты) {
    console.log(`  ${п.готов ? '✓' : '✗'} ${п.что}`)
    if (!п.готов && п.подсказка) console.log(`      ${п.подсказка}`)
  }

  const всё = пункты.every((п) => п.готов)
  if (всё) {
    console.log('\n✓ Контур живёт на боевом адресе.')
  } else if (готовКПереезду) {
    console.log('\nБой готов, адреса ещё на превью. Переключить:')
    console.log('  npx tsx scripts/care/go-prod.ts --переключить --применить')
  } else {
    console.log('\nПереключать рано: сначала мерж в main и выкладка.')
    console.log('Пока адреса на превью — контур работает там, и это нормально.')
  }
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
