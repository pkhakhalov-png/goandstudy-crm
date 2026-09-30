// Наполнить кабинет тестовыми делами, чтобы было на что смотреть.
//
//   npx tsx scripts/care/seed-pilot.ts                    # предпросмотр
//   npx tsx scripts/care/seed-pilot.ts --применить
//   npx tsx scripts/care/seed-pilot.ts --сколько 20
//   npx tsx scripts/care/seed-pilot.ts --убрать --применить
//
// ЧТО ЭТО. Двадцать дел «Клиент 1 … Клиент 20» с задачами, фактами и
// контактами. Настоящих клиентов не трогает: в `public.clients` не создаётся
// ни одной строки, у синтетических дел `client_id` отрицательный, а имя
// лежит в самом деле (`synthetic_name`).
//
// Правило раздела 2.7 архитектуры: синтетика живёт только в `care.*`, помечена
// `is_synthetic = true` и убирается одной командой. Старый кабинет её не
// видит вовсе — он про схему `care` не знает.
//
// ЗАЧЕМ РАЗНЫЕ ДАННЫЕ, А НЕ ДВАДЦАТЬ ОДИНАКОВЫХ. Пустой и однообразный
// кабинет не показывает ничего: непонятно, работает ли сортировка по срокам,
// видно ли просроченное, отличается ли «ждём клиента» от «ждём вуз». Поэтому
// сроки раскиданы от просроченных до далёких, часть задач висит, часть
// закрыта, у части дел есть черновики фактов, которые можно подтвердить.
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

async function запрос<T>(метод: string, путь: string, тело?: unknown): Promise<T[]> {
  const h: Record<string, string> = {
    apikey: ANON!,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    [метод === 'GET' ? 'Accept-Profile' : 'Content-Profile']: 'care',
  }
  if (метод !== 'GET') h.Prefer = 'return=representation'
  const r = await fetch(`${SUPA}/rest/v1/${путь}`, { method: метод, headers: h, body: тело ? JSON.stringify(тело) : undefined })
  const текст = await r.text()
  if (!r.ok) throw new Error(`${метод} ${путь} → ${r.status}: ${текст.slice(0, 250)}`)
  return текст ? (JSON.parse(текст) as T[]) : []
}

/** Дата через N дней в формате, который принимает колонка date. */
function через(дней: number): string {
  return new Date(Date.now() + дней * 86_400_000).toISOString().slice(0, 10)
}

const СТРАНЫ = ['Германия', 'Италия', 'Словакия', 'Испания', 'Чехия', 'Нидерланды', 'Кипр', 'Польша']
const УСЛУГИ = ['полное сопровождение', 'магистратура', 'бакалавриат', 'языковые курсы', 'Foundation']

/**
 * Заготовки задач. Срок и «кого ждём» подобраны так, чтобы на экране было
 * видно разное: просрочка, сегодня, далёкий срок, ожидание вуза.
 */
const ЗАДАЧИ: { title: string; дней: number; waiting_on: string; status: string }[] = [
  { title: 'Собрать документы об образовании', дней: -6, waiting_on: 'client', status: 'waiting' },
  { title: 'Перевод и апостиль диплома', дней: 3, waiting_on: 'client', status: 'waiting' },
  { title: 'Запросить у вуза требования к портфолио', дней: 0, waiting_on: 'university', status: 'waiting' },
  { title: 'Проверить сроки подачи по выбранным программам', дней: 12, waiting_on: 'none', status: 'in_progress' },
  { title: 'Записать на консультацию по визе', дней: 25, waiting_on: 'specialist', status: 'todo' },
  { title: 'Подготовить мотивационное письмо', дней: 40, waiting_on: 'none', status: 'todo' },
  { title: 'Сверить бюджет после смены страны', дней: -14, waiting_on: 'review', status: 'waiting' },
]

const ФАКТЫ: { field: string; value: unknown; currency?: string; quote: string; is_plan?: boolean }[] = [
  { field: 'budget.tuition.max', value: 12000, currency: 'EUR', quote: 'До двенадцати тысяч евро за год, больше не потянем' },
  { field: 'budget.living.max', value: 800, currency: 'EUR', quote: 'На жильё где-то восемьсот в месяц' },
  { field: 'language.ielts.overall', value: 6.5, quote: 'IELTS 6.5 сдала в мае' },
  { field: 'language.german.level', value: 'B1', quote: 'Немецкий буду подтягивать до B2 к лету', is_plan: true },
  { field: 'intake.year', value: 2027, quote: 'Хотим поступать на осень двадцать седьмого' },
]

async function убрать(писать: boolean) {
  const есть = await запрос<{ id: string }>('GET', 'cases?select=id&is_synthetic=eq.true')
  console.log(`Тестовых дел в базе: ${есть.length}`)
  if (!есть.length) return
  if (!писать) {
    console.log('Это предпросмотр. Чтобы удалить, добавь --применить')
    return
  }
  // Задачи, факты, контакты и журнал уходят каскадом за делом.
  await запрос('DELETE', 'cases?is_synthetic=eq.true')
  console.log(`✓ удалено ${есть.length} тестовых дел вместе с задачами, фактами и контактами`)
}

async function main() {
  if (!SUPA || !ANON || !KEY) {
    console.error('Нужны NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY и CARE_DB_KEY')
    process.exit(1)
  }

  const писать = process.argv.includes('--применить')

  if (process.argv.includes('--убрать')) {
    await убрать(писать)
    return
  }

  const сколько = Number(аргумент('сколько') ?? 20)

  // Владельцами делаем настоящих сотрудников контура: иначе дела будут ничьи
  // и не попадут ни в чью область видимости — кабинет снова окажется пустым.
  const кураторы = await запрос<{ id: string; care_role: string }>(
    'GET',
    'members?select=id,care_role&active=eq.true&care_role=eq.curator'
  )
  if (!кураторы.length) {
    console.error('В контуре нет кураторов. Сначала: npx tsx scripts/care/setup-team.ts --руководитель <user_id> --применить')
    process.exit(1)
  }

  const уже = await запрос<{ id: string }>('GET', 'cases?select=id&is_synthetic=eq.true')

  console.log(`\n${писать ? 'ПРИМЕНЯЮ' : 'ПРЕДПРОСМОТР'} · дел ${сколько} · кураторов ${кураторы.length}`)
  if (уже.length) {
    console.log(`\nВ базе уже ${уже.length} тестовых дел. Сначала убери их:`)
    console.log('  npx tsx scripts/care/seed-pilot.ts --убрать --применить')
    return
  }

  for (let н = 1; н <= сколько; н++) {
    const куратор = кураторы[(н - 1) % кураторы.length]
    const страна = СТРАНЫ[(н - 1) % СТРАНЫ.length]
    const услуга = УСЛУГИ[(н - 1) % УСЛУГИ.length]
    const год = 2027 + ((н - 1) % 2)
    const имя = `Клиент ${н}`

    if (!писать) {
      console.log(`  + ${имя.padEnd(12)} ${страна.padEnd(12)} ${услуга.padEnd(22)} набор ${год}`)
      continue
    }

    const [дело] = await запрос<{ id: string }>('POST', 'cases', {
      // Отрицательный номер: в рабочей таблице таких нет и быть не может,
      // поэтому случайно сойтись с настоящим клиентом невозможно.
      client_id: -1000 - н,
      intake_year: год,
      service_scope: услуга,
      owner_member_id: куратор.id,
      automation_owner: 'legacy',
      is_synthetic: true,
      synthetic_name: имя,
      notes: `Тестовое дело. Страна: ${страна}.`,
    })

    await запрос('POST', 'contacts', {
      case_id: дело.id,
      kind: 'student',
      name: имя,
      // Чат не указываем: это тестовое дело, и отправлять по нему некуда.
      tg_chat_id: null,
      email: `client${н}@example.invalid`,
      can_decide: true,
    })
    if (н % 3 === 0) {
      await запрос('POST', 'contacts', {
        case_id: дело.id,
        kind: 'parent',
        name: `Родитель ${н}`,
        email: `parent${н}@example.invalid`,
        can_decide: true,
      })
    }

    // Задач разное количество: у одних дел густо, у других пусто — так на
    // экране видно, что счётчики считают, а не рисуют одно и то же.
    const сколькоЗадач = 1 + ((н * 3) % 4)
    for (let з = 0; з < сколькоЗадач; з++) {
      const шаблон = ЗАДАЧИ[(н + з) % ЗАДАЧИ.length]
      await запрос('POST', 'tasks', {
        case_id: дело.id,
        title: шаблон.title,
        due_on: через(шаблон.дней + н),
        waiting_on: шаблон.waiting_on,
        status: шаблон.status,
        assignee_member_id: куратор.id,
      })
    }
    // Каждое пятое дело — с закрытой задачей, чтобы было видно, что закрытые
    // не попадают в счётчики открытых.
    if (н % 5 === 0) {
      await запрос('POST', 'tasks', {
        case_id: дело.id,
        title: 'Подписать договор',
        status: 'done',
        waiting_on: 'none',
        closed_at: new Date().toISOString(),
        assignee_member_id: куратор.id,
      })
    }

    const [источник] = await запрос<{ id: string }>('POST', 'sources', {
      case_id: дело.id,
      kind: 'meeting',
      ref: { synthetic: true, note: 'вымышленная встреча для показа' },
      available: true,
    })

    const сколькоФактов = 2 + (н % 3)
    for (let ф = 0; ф < сколькоФактов; ф++) {
      const шаблон = ФАКТЫ[(н + ф) % ФАКТЫ.length]
      await запрос('POST', 'facts', {
        case_id: дело.id,
        field: шаблон.field,
        value: шаблон.value,
        currency: шаблон.currency ?? null,
        is_plan: шаблон.is_plan ?? false,
        speaker: ф === 0 ? 'student' : 'parent',
        quote: шаблон.quote,
        source_id: источник.id,
        // Часть фактов — черновики: на них видно кнопки «Подтвердить» и
        // «Отклонить», ради которых в карточке всё и затевалось.
        status: ф === 0 && н % 2 === 0 ? 'confirmed' : 'draft',
      })
    }

    await запрос('POST', 'events', {
      actor_kind: 'system',
      case_id: дело.id,
      action: 'synthetic_case_created',
      after: { name: имя, страна },
      source: { script: 'scripts/care/seed-pilot.ts' },
      reason: 'наполнение кабинета для показа',
    })

    console.log(`  ✓ ${имя.padEnd(12)} ${страна.padEnd(12)} задач ${сколькоЗадач}, фактов ${сколькоФактов}`)
  }

  if (!писать) {
    console.log('\nЭто предпросмотр. Чтобы записать, добавь --применить')
    return
  }

  console.log(`\n✓ Заведено ${сколько} тестовых дел.`)
  console.log('  Настоящие клиенты не затронуты: в public.clients не создано ни одной строки.')
  console.log('  Убрать всё: npx tsx scripts/care/seed-pilot.ts --убрать --применить')
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e)
  process.exit(1)
})
