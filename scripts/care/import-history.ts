// Перенести историю переписки в care.sources для заведённых дел.
//
//   npx tsx scripts/care/import-history.ts                 # предпросмотр
//   npx tsx scripts/care/import-history.ts --применить
//   npx tsx scripts/care/import-history.ts --дней 180      # глубина, по умолчанию 90
//   npx tsx scripts/care/import-history.ts --дело <case_id>
//
// ПОДГОТОВЛЕН, НО НЕ ЗАПУСКАЛСЯ. Запускать после link-chats.ts.
//
// ЗАЧЕМ ЭТО НУЖНО. Care-бот, добавленный в группу сегодня, вчерашней
// переписки не увидит: Bot API историю не отдаёт — ни getUpdates, ни любым
// другим способом. Для бота разговор начинается с момента, когда его
// впустили. А куратору нужен контекст: о чём договорились, какой бюджет
// называли, что обещали прислать.
//
// Этот контекст у нас уже есть — старый бот писал его полгода. Берём оттуда.
//
// ЧТО ИМЕННО ПЕРЕНОСИТСЯ. Не сами сообщения, а ссылки на них: строка в
// care.sources с видом 'message' и ссылкой на запись в рабочей таблице.
// Копировать текст незачем — он никуда не делся, а дубликат пришлось бы
// поддерживать в согласии с оригиналом.
//
// ИДЕМПОТЕНТНОСТЬ. Повторный запуск не создаёт вторых записей: перед
// вставкой проверяется, нет ли уже источника с той же ссылкой.
import { config } from 'dotenv'
import path from 'path'

config({ path: path.resolve(process.cwd(), '.env.local') })

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const KEY = process.env.CARE_DB_KEY

function аргумент(имя: string): string | null {
  const i = process.argv.indexOf(`--${имя}`)
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null
}

async function запрос<T>(схема: 'public' | 'care', метод: string, путь: string, тело?: unknown): Promise<T[]> {
  const h: Record<string, string> = {
    apikey: ANON!,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    [метод === 'GET' ? 'Accept-Profile' : 'Content-Profile']: схема,
  }
  if (метод !== 'GET') h.Prefer = 'return=representation'
  const r = await fetch(`${SUPA}/rest/v1/${путь}`, { method: метод, headers: h, body: тело ? JSON.stringify(тело) : undefined })
  const текст = await r.text()
  if (!r.ok) throw new Error(`${метод} ${путь} → ${r.status}: ${текст.slice(0, 200)}`)
  return текст ? (JSON.parse(текст) as T[]) : []
}

type Дело = { id: string; client_id: number }
type Сообщение = {
  id: string
  client_id: number
  direction: string
  sender_name: string | null
  sender_role: string | null
  content: string | null
  tg_chat_id: number | null
  created_at: string
}

async function main() {
  if (!SUPA || !ANON || !KEY) {
    console.error('Нужны NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY и CARE_DB_KEY')
    process.exit(1)
  }

  const писать = process.argv.includes('--применить')
  const дней = Number(аргумент('дней') ?? 90)
  const одноДело = аргумент('дело')
  const граница = new Date(Date.now() - дней * 86_400_000).toISOString()

  const дела = await запрос<Дело>(
    'care',
    'GET',
    `cases?select=id,client_id${одноДело ? `&id=eq.${одноДело}` : ''}`
  )
  if (!дела.length) {
    console.log('Дел нет. Сначала заведи их — scripts/care/import-cases.ts')
    return
  }

  console.log(`\n${писать ? 'ПРИМЕНЯЮ' : 'ПРЕДПРОСМОТР'} · глубина ${дней} дней · дел ${дела.length}\n`)

  let перенесено = 0
  let пропущено = 0

  for (const дело of дела) {
    // Читаем только зеркало для кабинета куратора: в нём сообщения уже
    // привязаны к клиенту. deal_messages привязаны к сделке, и связать их с
    // делом можно только через chat_id — это следующий шаг, когда привязки
    // проставлены link-chats.ts.
    const сообщения = await запрос<Сообщение>(
      'public',
      'GET',
      `client_tg_messages?select=id,client_id,direction,sender_name,sender_role,content,tg_chat_id,created_at` +
        `&client_id=eq.${дело.client_id}&created_at=gte.${граница}&order=created_at.asc`
    )

    if (!сообщения.length) {
      console.log(`  = дело ${дело.id.slice(0, 8)} (клиент ${дело.client_id}) — сообщений за период нет`)
      пропущено += 1
      continue
    }

    // Один источник на переписку, а не на каждое сообщение. Источник отвечает
    // на вопрос «откуда сведения», и ответ «из переписки с 1 июня по 5 августа,
    // 87 сообщений» точнее и полезнее, чем 87 одинаковых строк.
    const первое = сообщения[0]
    const последнее = сообщения[сообщения.length - 1]
    const ссылка = {
      kind: 'client_tg_messages',
      client_id: дело.client_id,
      tg_chat_id: последнее.tg_chat_id,
      from: первое.created_at,
      to: последнее.created_at,
      count: сообщения.length,
      first_id: первое.id,
      last_id: последнее.id,
    }

    const уже = await запрос<{ id: string }>(
      'care',
      'GET',
      `sources?select=id&case_id=eq.${дело.id}&kind=eq.message&ref->>last_id=eq.${последнее.id}`
    )
    if (уже.length) {
      console.log(`  = дело ${дело.id.slice(0, 8)} — уже перенесено (${сообщения.length} сообщ.)`)
      continue
    }

    console.log(
      `  + дело ${дело.id.slice(0, 8)} (клиент ${дело.client_id}) — ${сообщения.length} сообщ., ` +
        `${первое.created_at.slice(0, 10)} … ${последнее.created_at.slice(0, 10)}`
    )

    if (писать) {
      await запрос('care', 'POST', 'sources', {
        case_id: дело.id,
        kind: 'message',
        ref: ссылка,
        captured_at: последнее.created_at,
        available: true,
        note:
          `История из действующей CRM: ${сообщения.length} сообщений. ` +
          `Care-бот эту переписку не видел — Bot API историю до добавления не отдаёт.`,
      })
      await запрос('care', 'POST', 'events', {
        actor_kind: 'system',
        case_id: дело.id,
        action: 'history_imported',
        after: ссылка,
        source: { script: 'scripts/care/import-history.ts' },
        reason: `перенос истории за ${дней} дней`,
      })
    }
    перенесено += 1
  }

  console.log(`\nИтого: ${писать ? 'перенесено' : 'будет перенесено'} ${перенесено}, пропущено ${пропущено}`)
  if (!писать) console.log('Это предпросмотр. Чтобы записать, добавь --применить')
  console.log('\nСами сообщения не копируются — переносятся ссылки на них. Текст остаётся')
  console.log('в рабочей таблице, и дубликат не придётся держать в согласии с оригиналом.')
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e)
  process.exit(1)
})
