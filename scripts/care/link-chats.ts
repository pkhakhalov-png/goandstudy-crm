// Заполнить care.contacts.tg_chat_id по группам, которые старый бот уже видит.
//
//   npx tsx scripts/care/link-chats.ts                  # предпросмотр
//   npx tsx scripts/care/link-chats.ts --применить
//   npx tsx scripts/care/link-chats.ts --дело <case_id> # только одно дело
//
// ПОДГОТОВЛЕН, НО НЕ ЗАПУСКАЛСЯ. Запускать после того, как заведены дела.
//
// ЧТО ДЕЛАЕТ. Для каждого дела ищет группу Телеграма, название которой
// содержит имя И фамилию клиента, и записывает её chat_id в care.contacts.
// Читает public, пишет только в care — `clients.tg_group_chat_id` не трогает
// (это рабочая таблица, и роли туда запись не выдана).
//
// ПОЧЕМУ ПО ФИО, А НЕ ПО ТЕЛЕФОНУ. Автопривязка в старом вебхуке ищет в
// названии группы телефон. Проверено 28.09.2026: телефона нет ни в одном из
// 472 названий — механизм не сработал ни разу. Названия выглядят как
// «Циглинцев Дмитрий Словакия ПС»: имя есть, телефона нет.
//
// ПОЧЕМУ ТРЕБУЮТСЯ ОБЕ ЧАСТИ ИМЕНИ. Совпадение по одному имени даёт ложные
// привязки: «Александр Потапов» попадает на группу «Александра Яшникова».
// Чужая переписка в карточке клиента — это утечка, а не неудобство, поэтому
// неоднозначные совпадения пропускаются, а не берутся наугад.
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
type Контакт = { id: string; case_id: string; kind: string; name: string; tg_chat_id: number | null }
type Группа = { chat_id: string; title: string; last_at: string; message_count: number }

/**
 * Группы Телеграма из представления `care.group_chats`.
 *
 * Не из `public.deal_messages` напрямую: та таблица роли контура не выдана,
 * и правильно — там вся переписка воронки продаж. Представление отдаёт
 * четыре поля и ни строчки текста (миграция care/009).
 */
async function собратьГруппы() {
  const строки = await запрос<Группа>(
    'care',
    'GET',
    'group_chats?select=chat_id,title,last_at,message_count&order=message_count.desc'
  )
  return new Map(строки.map((г) => [г.chat_id, г]))
}

/**
 * Совпадение строгое: в названии группы есть и имя, и фамилия.
 *
 * Обе части обязательны. По одному имени совпадений втрое больше, но среди
 * них ложные: «Александр Потапов» попадает на «Александру Яшникову». Чужая
 * переписка в карточке клиента — утечка, а не неудобство.
 *
 * Требование к длине — к самой длинной части, а не к обеим. Иначе «Ян
 * Уступс» не сопоставится: «Ян» это две буквы, хотя «Уступс» в названии
 * стоит и ошибиться тут не на чем.
 */
function подходит(имяКлиента: string, названиеГруппы: string): boolean {
  const части = имяКлиента.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  if (части.length < 2) return false
  // Хотя бы одна часть должна быть достаточно редкой, чтобы не ловить всё
  // подряд: два коротких слова совпадут слишком со многим.
  if (!части.some((ч) => ч.length >= 5)) return false
  const н = названиеГруппы.toLowerCase()
  return части.every((ч) => н.includes(ч.toLowerCase()))
}

async function main() {
  if (!SUPA || !ANON || !KEY) {
    console.error('Нужны NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY и CARE_DB_KEY')
    process.exit(1)
  }

  const писать = process.argv.includes('--применить')
  const одноДело = аргумент('дело')

  // Синтетические дела пропускаем молча: клиента в рабочей таблице у них нет
  // по построению, и группы тоже — ругаться тут не на что.
  const дела = await запрос<Дело>(
    'care',
    'GET',
    `cases?select=id,client_id&is_synthetic=eq.false${одноДело ? `&id=eq.${одноДело}` : ''}`
  )
  if (!дела.length) {
    console.log('Дел нет. Сначала заведи их — scripts/care/import-cases.ts')
    return
  }

  const клиенты = await запрос<{ id: number; name: string | null }>(
    'public',
    'GET',
    `clients?select=id,name&id=in.(${дела.map((д) => д.client_id).join(',')})`
  )
  const имяКлиента = new Map(клиенты.map((к) => [к.id, к.name ?? '']))

  console.log('Собираю группы из переписки сделок…')
  const группы = await собратьГруппы()
  console.log(`  групп с названием: ${группы.size}`)

  console.log(`\n${писать ? 'ПРИМЕНЯЮ' : 'ПРЕДПРОСМОТР'}\n`)

  let привязано = 0
  let пропущено = 0

  for (const дело of дела) {
    const имя = имяКлиента.get(дело.client_id) ?? ''
    const подпись = `${(имя || `#${дело.client_id}`).slice(0, 24).padEnd(26)}`

    const контакты = await запрос<Контакт>(
      'care',
      'GET',
      `contacts?select=id,case_id,kind,name,tg_chat_id&case_id=eq.${дело.id}&kind=eq.student`
    )
    const контакт = контакты[0]

    if (!контакт) {
      console.log(`  ✗ ${подпись} нет контакта студента — нечего заполнять`)
      пропущено += 1
      continue
    }
    if (контакт.tg_chat_id) {
      console.log(`  = ${подпись} чат уже указан (${контакт.tg_chat_id})`)
      continue
    }
    if (!имя.trim()) {
      console.log(`  ✗ ${подпись} у клиента нет имени в карточке`)
      пропущено += 1
      continue
    }

    const совпавшие = [...группы.entries()].filter(([, г]) => подходит(имя, г.title))

    if (совпавшие.length === 0) {
      console.log(`  ✗ ${подпись} группа не найдена по ФИО`)
      пропущено += 1
      continue
    }
    if (совпавшие.length > 1) {
      // Несколько групп на одного человека — не повод выбрать любую.
      console.log(`  ? ${подпись} найдено ${совпавшие.length} групп, нужен человек:`)
      for (const [id, г] of совпавшие.slice(0, 4)) console.log(`        ${id}  ${г.title.slice(0, 50)}`)
      пропущено += 1
      continue
    }

    const [chatId, группа] = совпавшие[0]
    console.log(`  + ${подпись} ${группа.title.slice(0, 40)}  ${группа.message_count} сообщ.`)

    if (писать) {
      await запрос('care', 'PATCH', `contacts?id=eq.${контакт.id}`, { tg_chat_id: Number(chatId) })
      await запрос('care', 'POST', 'events', {
        actor_kind: 'system',
        case_id: дело.id,
        action: 'chat_linked',
        after: { tg_chat_id: chatId, title: группа.title, messages: группа.message_count },
        source: { script: 'scripts/care/link-chats.ts', match: 'фамилия+имя в названии' },
        reason: 'привязка группы по совпадению ФИО',
      })
    }
    привязано += 1
  }

  console.log(`\nИтого: ${писать ? 'привязано' : 'будет привязано'} ${привязано}, пропущено ${пропущено}`)
  if (!писать) console.log('Это предпросмотр. Чтобы записать, добавь --применить')
  console.log('\nclients.tg_group_chat_id не трогается: это рабочая таблица, роли контура запись туда не выдана.')
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e)
  process.exit(1)
})
