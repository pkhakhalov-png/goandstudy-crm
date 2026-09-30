// Завести дела контура v2 по списку клиентов действующей CRM.
//
//   npx tsx scripts/care/import-cases.ts --клиенты 12,34,56          # предпросмотр
//   npx tsx scripts/care/import-cases.ts --клиенты 12,34 --применить # записать
//   npx tsx scripts/care/import-cases.ts --куратор <uuid>            # все клиенты куратора
//   npx tsx scripts/care/import-cases.ts --клиенты 12 --год 2027     # год набора вручную
//   npx tsx scripts/care/import-cases.ts --клиенты 12 --владелец <user_id>
//        ↑ запасной владелец для клиентов, чей куратор не заведён в CRM
//
// ПРЕДПРОСМОТР ПО УМОЛЧАНИЮ. Без `--применить` скрипт ничего не пишет, а
// показывает, что собирается сделать. Импорт — операция, которую хочется
// сначала посмотреть глазами: список клиентов набирается руками, и опечатка
// в номере заводит дело не тому человеку.
//
// РАБОЧИЕ ТАБЛИЦЫ ТОЛЬКО ЧИТАЮТСЯ. Ни одной записи в `public` — это не
// обещание, а свойство ключа: роли `care_app` запись туда не выдана.
//
// ИДЕМПОТЕНТНОСТЬ. Повторный запуск не создаёт вторых дел: пара
// (client_id, intake_year, intake_term) уникальна в базе, и скрипт проверяет
// её до вставки, чтобы сказать «уже есть», а не упасть на ограничении.
import { config } from 'dotenv'
import path from 'path'

config({ path: path.resolve(process.cwd(), '.env.local') })

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const KEY = process.env.CARE_DB_KEY

type Клиент = {
  id: number
  name: string | null
  email: string | null
  phone: string | null
  telegram: string | null
  country: string | null
  service_type: string | null
  status: string | null
  curator_id: string | null
  tg_group_chat_id: number | null
  tg_group_title: string | null
  expected_offer_month: string | null
}

type Куратор = { id: string; name: string | null; full_name: string | null; user_id: string | null }

function аргумент(имя: string): string | null {
  const i = process.argv.indexOf(`--${имя}`)
  if (i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1]
  const сРавно = process.argv.find((a) => a.startsWith(`--${имя}=`))
  return сРавно ? сРавно.slice(имя.length + 3) : null
}

async function запрос<T>(схема: 'public' | 'care', метод: string, путь: string, тело?: unknown): Promise<T[]> {
  const h: Record<string, string> = {
    apikey: ANON!,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    [метод === 'GET' ? 'Accept-Profile' : 'Content-Profile']: схема,
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

/**
 * Год набора.
 *
 * Берётся из `expected_offer_month`, если он заполнен: это ближайшее к правде,
 * что есть в действующей CRM. Иначе — следующий календарный год, потому что
 * поступают вперёд, а не назад. Всегда перебивается ключом `--год`: угадывать
 * там, где человек знает точно, незачем.
 */
function годНабора(клиент: Клиент): number {
  const вручную = аргумент('год')
  if (вручную) return Number(вручную)
  if (клиент.expected_offer_month) {
    const год = Number(String(клиент.expected_offer_month).slice(0, 4))
    if (год > 2000 && год < 2100) return год
  }
  return new Date().getFullYear() + 1
}

async function main() {
  if (!SUPA || !ANON || !KEY) {
    console.error('Нужны NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY и CARE_DB_KEY в .env.local')
    process.exit(1)
  }

  const применить = process.argv.includes('--применить')
  const списокКлиентов = аргумент('клиенты')
  const пoКуратору = аргумент('куратор')
  const запасной = аргумент('владелец')

  if (!списокКлиентов && !пoКуратору) {
    console.error('Укажи --клиенты 12,34,56 или --куратор <id>')
    process.exit(1)
  }

  // ── Читаем рабочие данные ────────────────────────────────────────────────
  const фильтр = списокКлиентов
    ? `id=in.(${списокКлиентов.split(',').map((s) => s.trim()).join(',')})`
    : `curator_id=eq.${пoКуратору}`

  const клиенты = await запрос<Клиент>(
    'public',
    'GET',
    `clients?select=id,name,email,phone,telegram,country,service_type,status,curator_id,tg_group_chat_id,tg_group_title,expected_offer_month&${фильтр}`
  )

  if (!клиенты.length) {
    console.log('По этому условию клиентов не нашлось. Ничего не делаю.')
    return
  }

  // curator_id — uuid и ссылается на curators.id, а не на users.id.
  // Проверено 28.09.2026 запросом: по users.id такой записи нет.
  const идКураторов = [...new Set(клиенты.map((к) => к.curator_id).filter((x): x is string => x != null))]
  const кураторы = идКураторов.length
    ? await запрос<Куратор>('public', 'GET', `curators?select=id,name,full_name,user_id&id=in.(${идКураторов.join(',')})`)
    : []
  const кураторПоId = new Map(кураторы.map((к) => [к.id, к]))

  // ── Считаем, что будем делать ────────────────────────────────────────────
  type Строка = {
    клиент: Клиент
    год: number
    куратор: Куратор | null
    участникId: string | null
    делоЕсть: boolean
    беда: string | null
    предупреждение: string | null
    наЗапасного: boolean
  }

  const план: Строка[] = []

  for (const клиент of клиенты) {
    const куратор = клиент.curator_id != null ? (кураторПоId.get(клиент.curator_id) ?? null) : null
    const год = годНабора(клиент)

    // Беда — то, без чего дело не завести. Предупреждение — то, с чем дело
    // заводится, но работать в полную силу не сможет.
    // Куратор без учётной записи — не повод терять дело. Переносим на
    // запасного владельца (обычно руководителя), а передать настоящему
    // куратору можно одной кнопкой, когда учётку заведут. Потерянное при
    // переносе дело найдётся нескоро, а неправильный владелец виден сразу.
    let беда: string | null = null
    let наЗапасного = false
    if (!куратор) {
      if (запасной) наЗапасного = true
      else беда = 'у клиента не назначен куратор'
    } else if (!куратор.user_id) {
      if (запасной) наЗапасного = true
      else беда = `у куратора «${куратор.name ?? куратор.id}» нет учётной записи (user_id)`
    }

    // Пустой tg_group_chat_id почти всегда означает не «группы нет», а
    // «привязка не проставлена»: групп 698, а привязок было 2, потому что
    // автопривязка ищет в названии группы телефон, которого там не бывает
    // (см. docs/care/CHANNELS_REALITY.md). Заполняется link-chats.ts.
    const предупреждение = !клиент.tg_group_chat_id
      ? 'привязка к группе не проставлена — заполнить scripts/care/link-chats.ts'
      : null

    // Есть ли уже такое дело. Проверяем, а не надеемся на ограничение:
    // сообщение «уже есть» полезнее, чем падение на нарушении уникальности.
    const уже = await запрос<{ id: string }>(
      'care',
      'GET',
      `cases?select=id&client_id=eq.${клиент.id}&intake_year=eq.${год}&intake_term=is.null`
    )

    let участникId: string | null = null
    const чейUser = наЗапасного ? запасной : куратор?.user_id
    if (чейUser) {
      const есть = await запрос<{ id: string }>('care', 'GET', `members?select=id&user_id=eq.${чейUser}`)
      участникId = есть[0]?.id ?? null
    }

    план.push({ клиент, год, куратор, участникId, делоЕсть: уже.length > 0, беда, предупреждение, наЗапасного })
  }

  // ── Показываем ───────────────────────────────────────────────────────────
  console.log(`\n${применить ? 'ПРИМЕНЯЮ' : 'ПРЕДПРОСМОТР'} — клиентов: ${план.length}\n`)

  for (const с of план) {
    const имя = (с.клиент.name ?? `#${с.клиент.id}`).padEnd(28).slice(0, 28)
    if (с.беда) {
      console.log(`  ✗ ${имя} ${с.беда}`)
    } else if (с.делоЕсть) {
      console.log(`  = ${имя} дело ${с.год} уже заведено — пропускаю`)
    } else {
      const кто = с.куратор?.name ?? с.куратор?.full_name ?? 'не назначен'
      const участник = с.участникId ? 'участник есть' : 'участник будет заведён'
      console.log(`  + ${имя} год ${с.год}, куратор ${кто} (${участник})`)
      if (с.наЗапасного) {
        console.log(`      → владелец: запасной, у куратора «${кто}» нет учётной записи`)
      }
      if (с.предупреждение) console.log(`      ⚠ ${с.предупреждение}`)
    }
  }

  const кСозданию = план.filter((с) => !с.беда && !с.делоЕсть)
  const пропущено = план.filter((с) => с.беда)

  const безГруппы = кСозданию.filter((с) => с.предупреждение).length

  console.log(`\nИтого: завести ${кСозданию.length}, пропустить ${план.length - кСозданию.length}`)
  if (пропущено.length) {
    console.log(`Из них с проблемами: ${пропущено.length} — их нужно починить в действующей CRM, здесь чинить нечего.`)
  }
  if (безГруппы) {
    console.log(`Без привязки к группе: ${безГруппы} — заполнить: npx tsx scripts/care/link-chats.ts`)
  }

  if (!применить) {
    console.log('\nЭто предпросмотр. Чтобы записать, добавь --применить')
    return
  }
  if (!кСозданию.length) {
    console.log('\nЗаводить нечего.')
    return
  }

  // ── Пишем (только в care) ────────────────────────────────────────────────
  console.log('')
  let заведено = 0

  for (const с of кСозданию) {
    try {
      // Сотрудник контура. Заводится один раз на куратора; роль по умолчанию
      // «curator» — кто из них lead, решает владелец отдельно.
      let участникId = с.участникId
      if (!участникId) {
        const чей = с.наЗапасного ? запасной! : с.куратор!.user_id!
        const создан = await запрос<{ id: string }>('care', 'POST', 'members', {
          user_id: чей,
          care_role: 'curator',
        })
        участникId = создан[0].id
      }

      const дело = await запрос<{ id: string }>('care', 'POST', 'cases', {
        client_id: с.клиент.id,
        intake_year: с.год,
        service_scope: с.клиент.service_type,
        owner_member_id: участникId,
        automation_owner: 'legacy',
        notes: [
          с.клиент.country ? `Страна из CRM: ${с.клиент.country}` : null,
          с.наЗапасного
            ? `Владелец временный: у куратора «${с.куратор?.name ?? 'не назначен'}» нет учётной записи в CRM. Передать, когда заведут.`
            : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
      })

      // Контакт студента. Получатель отправок берётся отсюда и только отсюда —
      // не из текста предложения, чтобы подменённый текст не увёл сообщение.
      await запрос('care', 'POST', 'contacts', {
        case_id: дело[0].id,
        kind: 'student',
        name: с.клиент.name ?? `Клиент #${с.клиент.id}`,
        tg_chat_id: с.клиент.tg_group_chat_id,
        phone: с.клиент.phone,
        email: с.клиент.email,
        can_decide: true,
      })

      await запрос('care', 'POST', 'events', {
        actor_kind: 'system',
        case_id: дело[0].id,
        action: 'case_imported',
        after: { client_id: с.клиент.id, intake_year: с.год, владелец_временный: с.наЗапасного },
        source: { script: 'scripts/care/import-cases.ts' },
        reason: с.наЗапасного
          ? 'импорт пилотного клиента; владелец временный — у куратора нет учётной записи'
          : 'импорт пилотного клиента',
      })

      console.log(`  ✓ ${(с.клиент.name ?? `#${с.клиент.id}`).slice(0, 30)} — дело заведено`)
      заведено += 1
    } catch (e) {
      console.log(`  ✗ ${(с.клиент.name ?? `#${с.клиент.id}`).slice(0, 30)} — ${e instanceof Error ? e.message : e}`)
    }
  }

  // Сверка количеств: сколько собирались завести и сколько получилось.
  console.log(`\nЗаведено ${заведено} из ${кСозданию.length}.`)
  if (заведено !== кСозданию.length) {
    console.log('Часть не прошла — разберись по сообщениям выше, повторный запуск не создаст дублей.')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e)
  process.exit(1)
})
