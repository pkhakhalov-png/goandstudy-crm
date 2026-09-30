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
// ЧТО ИМЕННО ПЕРЕНОСИТСЯ. Не сами сообщения, а запись об их существовании:
// строка в care.sources с видом 'message', ссылкой на чат и границами
// периода. Копировать текст незачем — он никуда не делся, а дубликат
// пришлось бы поддерживать в согласии с оригиналом.
//
// ОТКУДА. Из представления `care.group_chats` по chat_id, проставленному
// скриптом link-chats.ts. Не из `client_tg_messages`: туда сообщение
// попадает только если у клиента заполнен tg_group_chat_id, а он заполнен
// у двоих из семидесяти шести. Не из `public.deal_messages` напрямую: та
// таблица роли контура не выдана, и правильно — там вся воронка продаж.
//
// ⚠ ТЕКСТ ПЕРЕПИСКИ КОНТУРУ ПОКА НЕДОСТУПЕН. Видно, что она есть, сколько
// её и за какой период. Читать её помощнику — отдельное решение владельца:
// это содержимое разговоров с клиентами, и открывать его роли нужно
// осознанно, а не заодно.
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

type Дело = { id: string; client_id: number; synthetic: boolean }
type Контакт = { case_id: string; tg_chat_id: number | null; name: string }
type Чат = { chat_id: string; title: string; first_at: string; last_at: string; message_count: number }

async function main() {
  if (!SUPA || !ANON || !KEY) {
    console.error('Нужны NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY и CARE_DB_KEY')
    process.exit(1)
  }

  const писать = process.argv.includes('--применить')
  const дней = Number(аргумент('дней') ?? 90)
  const одноДело = аргумент('дело')

  const дела = await запрос<Дело>(
    'care',
    'GET',
    `cases?select=id,client_id,is_synthetic&is_synthetic=eq.false${одноДело ? `&id=eq.${одноДело}` : ''}`
  )
  if (!дела.length) {
    console.log('Дел нет. Сначала заведи их — scripts/care/import-cases.ts')
    return
  }

  const контакты = await запрос<Контакт>(
    'care',
    'GET',
    `contacts?select=case_id,tg_chat_id,name&kind=eq.student&case_id=in.(${дела.map((д) => д.id).join(',')})`
  )
  const чатПоДелу = new Map(
    контакты.filter((к) => к.tg_chat_id != null).map((к) => [к.case_id, String(к.tg_chat_id)])
  )
  const имяПоДелу = new Map(контакты.map((к) => [к.case_id, к.name]))

  const чаты = await запрос<Чат>(
    'care',
    'GET',
    'group_chats?select=chat_id,title,first_at,last_at,message_count'
  )
  const чатПоId = new Map(чаты.map((ч) => [ч.chat_id, ч]))

  console.log(`\n${писать ? 'ПРИМЕНЯЮ' : 'ПРЕДПРОСМОТР'} · глубина ${дней} дней · дел ${дела.length}\n`)

  let перенесено = 0
  let пропущено = 0

  for (const дело of дела) {
    const подпись = (имяПоДелу.get(дело.id) ?? `#${дело.client_id}`).slice(0, 24).padEnd(26)
    const chatId = чатПоДелу.get(дело.id)

    if (!chatId) {
      console.log(`  ✗ ${подпись} группа не привязана — сначала link-chats.ts`)
      пропущено += 1
      continue
    }

    const чат = чатПоId.get(chatId)
    if (!чат) {
      console.log(`  ✗ ${подпись} по чату ${chatId} переписки не нашлось`)
      пропущено += 1
      continue
    }

    if (new Date(чат.last_at).getTime() < Date.now() - дней * 86_400_000) {
      console.log(`  = ${подпись} последнее сообщение ${чат.last_at.slice(0, 10)} — старше окна`)
      пропущено += 1
      continue
    }

    const ссылка = {
      kind: 'telegram_group',
      chat_id: chatId,
      title: чат.title,
      from: чат.first_at,
      to: чат.last_at,
      count: чат.message_count,
    }

    const уже = await запрос<{ id: string }>(
      'care',
      'GET',
      `sources?select=id&case_id=eq.${дело.id}&kind=eq.message&ref->>chat_id=eq.${chatId}`
    )
    if (уже.length) {
      console.log(`  = ${подпись} уже перенесено (${чат.message_count} сообщ.)`)
      continue
    }

    console.log(
      `  + ${подпись} ${чат.message_count} сообщ., ${чат.first_at.slice(0, 10)} … ${чат.last_at.slice(0, 10)}`
    )

    if (писать) {
      await запрос('care', 'POST', 'sources', {
        case_id: дело.id,
        kind: 'message',
        ref: ссылка,
        captured_at: чат.last_at,
        available: true,
        note:
          `Переписка в группе «${чат.title}»: ${чат.message_count} сообщений с ` +
          `${чат.first_at.slice(0, 10)} по ${чат.last_at.slice(0, 10)}. ` +
          `Care-бот её не видел — Bot API историю до добавления не отдаёт.`,
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
  console.log('\nСами сообщения не копируются: переносится запись об их существовании —')
  console.log('чат, период и количество. Текст переписки контуру пока не выдан.')
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e)
  process.exit(1)
})
