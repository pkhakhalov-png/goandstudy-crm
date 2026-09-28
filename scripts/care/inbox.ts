// Что приехало в контур: последние входящие события и задания очереди.
//
//   npx tsx scripts/care/inbox.ts            # последние 10 событий
//   npx tsx scripts/care/inbox.ts --всё      # ещё и очередь заданий
//
// Нужен, чтобы отвечать на вопрос «дошло ли» не догадками. Телеграм про свои
// неудачи рассказывает только в getWebhookInfo и только про последнюю —
// а здесь видно, что именно легло в базу.
import { config } from 'dotenv'
import path from 'path'

config({ path: path.resolve(process.cwd(), '.env.local') })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const KEY = process.env.CARE_DB_KEY

type Событие = {
  id: string
  channel: string
  external_id: string
  received_at: string
  processed_at: string | null
  error: string | null
  payload: Record<string, unknown>
}

async function прочитать<T>(путь: string): Promise<T[]> {
  const r = await fetch(`${URL}/rest/v1/${путь}`, {
    headers: { apikey: ANON!, Authorization: `Bearer ${KEY}`, 'Accept-Profile': 'care' },
  })
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`)
  return (await r.json()) as T[]
}

/** Из сырого события Телеграма — что видно человеку. */
function пересказать(payload: Record<string, unknown>): string {
  const u = payload as {
    message?: { chat?: { id?: number; type?: string; title?: string }; from?: { first_name?: string }; text?: string }
  }
  const m = u.message
  if (!m) return Object.keys(payload).join(', ')
  const чат = m.chat?.title ?? m.chat?.type ?? '?'
  const кто = m.from?.first_name ?? '?'
  const текст = m.text ? `«${m.text.slice(0, 40)}»` : '(без текста)'
  return `${чат} · ${кто}: ${текст}`
}

async function main() {
  if (!URL || !ANON || !KEY) {
    console.error('Нужны NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY и CARE_DB_KEY в .env.local')
    process.exit(1)
  }

  const события = await прочитать<Событие>(
    'inbound_events?select=id,channel,external_id,received_at,processed_at,error,payload&order=received_at.desc&limit=10'
  )

  console.log(`\nВходящие события: ${события.length === 0 ? 'пусто' : события.length}`)
  for (const с of события) {
    const время = new Date(с.received_at).toLocaleString('ru-RU')
    const состояние = с.error ? `ошибка: ${с.error}` : с.processed_at ? 'разобрано' : 'ждёт разбора'
    console.log(`  ${время}  ${с.channel}#${с.external_id}  [${состояние}]`)
    console.log(`      ${пересказать(с.payload)}`)
  }

  // Дубли тут были бы самой дорогой из ошибок: одно сообщение клиента —
  // несколько напоминаний в ответ. Проверяем прямо, а не надеемся.
  const ключи = события.map((с) => `${с.channel}#${с.external_id}`)
  const дубли = ключи.filter((к, i) => ключи.indexOf(к) !== i)
  console.log(дубли.length ? `\n✗ ДУБЛИ: ${[...new Set(дубли)].join(', ')}` : '\n✓ дублей нет')

  if (process.argv.includes('--всё')) {
    const задания = await прочитать<{ kind: string; status: string; attempts: number; last_error: string | null }>(
      'jobs?select=kind,status,attempts,last_error&order=created_at.desc&limit=10'
    )
    console.log(`\nЗадания очереди: ${задания.length === 0 ? 'пусто' : задания.length}`)
    for (const з of задания) {
      console.log(`  ${з.kind}  ${з.status}  попыток ${з.attempts}${з.last_error ? `  ← ${з.last_error}` : ''}`)
    }
  }
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e)
  process.exit(1)
})
