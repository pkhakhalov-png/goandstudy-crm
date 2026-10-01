// Демо-дело: карточка в том виде, в каком она выглядит после установочной встречи.
//
//   npx tsx scripts/care/seed-demo.ts            # предпросмотр
//   npx tsx scripts/care/seed-demo.ts --применить
//   npx tsx scripts/care/seed-demo.ts --убрать --применить
//
// ЗАЧЕМ ОТДЕЛЬНОЕ ДЕЛО, А НЕ НАСТОЯЩИЙ КЛИЕНТ. Чтобы показать подбор и
// стратегию, нужна полная карточка: страна, направление, уровень, бюджет,
// язык, год. У настоящих клиентов половины этого нет, а дописать выдуманный
// бюджет живому человеку нельзя — он потом попадёт в подборку и в разговор.
//
// Дело помечено `is_synthetic`, то есть везде в интерфейсе идёт с плашкой
// «тест» и не попадает в выборки по рабочим таблицам старой CRM.
//
// ЧТО В НЁМ ЕСТЬ. Факты со встречи — подтверждённые, с цитатами, какие бывают
// в настоящем разговоре; задачи, включая одну «ждём клиента» со сроком —
// по ней правило готовит напоминание; источник «встреча в Zoom».
import { config } from 'dotenv'
import path from 'path'

config({ path: path.resolve(process.cwd(), '.env.local') })

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const KEY = process.env.CARE_DB_KEY

const ИМЯ = 'Алиса Рожкова (демо)'
const КЛИЕНТ_ID = -990_001

async function запрос<T>(метод: string, путь: string, тело?: unknown): Promise<T[]> {
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
  if (!r.ok) throw new Error(`${метод} ${путь} → ${r.status}: ${текст.slice(0, 300)}`)
  return текст ? (JSON.parse(текст) as T[]) : []
}

const дней = (н: number) => new Date(Date.now() + н * 86_400_000).toISOString().slice(0, 10)

/**
 * Факты встречи.
 *
 * Цитаты настоящие по форме: так люди и говорят на установочной — не
 * «бюджет 12000 EUR», а «тысяч двенадцать в год потянем, если без общежития».
 * Подбор берёт из них только значения, но цитата остаётся: куратор должен
 * видеть, на чём стоит вывод.
 */
const ФАКТЫ: {
  field: string
  value: string | number
  currency?: string
  is_plan?: boolean
  quote: string
}[] = [
  {
    field: 'country.target',
    value: 'Германия, Нидерланды',
    quote: 'Решили так: Германия в первую очередь, Нидерланды как второй вариант.',
  },
  {
    field: 'program.field',
    value: 'анализ данных и машинное обучение',
    quote: 'Хочу в данные — анализ, машинное обучение. Не чистая математика, а прикладное.',
  },
  {
    field: 'education.level_target',
    value: 'магистратура',
    quote: 'Бакалавриат заканчиваю этим летом, значит магистратура.',
  },
  {
    field: 'budget.tuition.max',
    value: 12000,
    currency: 'EUR',
    quote: 'Тысяч двенадцать в год на обучение потянем, если без общежития считать.',
  },
  {
    field: 'budget.living.max',
    value: 900,
    currency: 'EUR',
    quote: 'На жильё и жизнь закладываем до девятисот в месяц.',
  },
  { field: 'intake.year', value: 2027, quote: 'Целимся на двадцать седьмой, осенний набор.' },
  { field: 'intake.term', value: 'осенний семестр', quote: 'Целимся на двадцать седьмой, осенний набор.' },
  {
    field: 'language.english.level',
    value: 'C1, IELTS 7.0',
    quote: 'IELTS сдала в мае на семь ровно, сертификат на руках.',
  },
  {
    field: 'language.german.level',
    value: 'A2',
    is_plan: true,
    quote: 'Немецкий на уровне A2, к лету хочу подтянуть до B1.',
  },
  {
    field: 'education.current',
    value: 'бакалавриат прикладной математики, выпуск 2027',
    quote: 'Четвёртый курс прикладной математики, диплом летом двадцать седьмого.',
  },
  { field: 'gpa.value', value: '4.4 из 5', quote: 'Средний балл четыре и четыре.' },
]

const ЗАДАЧИ: { title: string; waiting_on: string; due_on: string | null; status: string; details?: string }[] = [
  {
    title: 'Перевод диплома с апостилем',
    waiting_on: 'client',
    due_on: дней(12),
    status: 'waiting',
    details: 'Договорились на встрече: Алиса заказывает перевод у присяжного переводчика.',
  },
  {
    title: 'Рекомендательные письма от научного руководителя',
    waiting_on: 'client',
    due_on: дней(25),
    status: 'waiting',
  },
  {
    title: 'Сверить сроки подачи в выбранных вузах',
    waiting_on: 'specialist',
    due_on: дней(7),
    status: 'todo',
  },
]

async function убрать(применить: boolean) {
  const дела = await запрос<{ id: string }>('GET', `cases?client_id=eq.${КЛИЕНТ_ID}&select=id`)
  if (!дела.length) {
    console.log('Демо-дела нет — убирать нечего.')
    return
  }
  if (!применить) {
    console.log(`Предпросмотр: будет удалено дело ${дела[0].id} со всем содержимым.`)
    return
  }
  await запрос('DELETE', `cases?client_id=eq.${КЛИЕНТ_ID}`)
  console.log('✓ Демо-дело убрано.')
}

async function завести(применить: boolean) {
  const уже = await запрос<{ id: string }>('GET', `cases?client_id=eq.${КЛИЕНТ_ID}&select=id`)
  if (уже.length) {
    console.log(`Демо-дело уже есть: ${уже[0].id}`)
    console.log('Чтобы пересобрать заново: --убрать --применить, потом --применить')
    return
  }

  const [руководитель] = await запрос<{ id: string }>('GET', 'members?care_role=eq.lead&select=id&limit=1')
  if (!руководитель) throw new Error('В контуре нет руководителя — некому назначить дело')

  console.log(`${применить ? 'ЗАВОЖУ' : 'ПРЕДПРОСМОТР'}: ${ИМЯ}`)
  console.log(`  фактов со встречи: ${ФАКТЫ.length}`)
  console.log(`  задач: ${ЗАДАЧИ.length} (из них ждём клиента: ${ЗАДАЧИ.filter((з) => з.waiting_on === 'client').length})`)
  console.log('  владелец: руководитель контура')

  if (!применить) {
    console.log('\nЭто предпросмотр. Чтобы записать, добавь --применить')
    return
  }

  const [дело] = await запрос<{ id: string }>('POST', 'cases', {
    client_id: КЛИЕНТ_ID,
    intake_year: 2027,
    intake_term: 'fall',
    service_scope: 'full',
    owner_member_id: руководитель.id,
    is_synthetic: true,
    synthetic_name: ИМЯ,
    // Сразу на новом кабинете: иначе ни подбор, ни напоминания его не увидят.
    automation_owner: 'v2',
    switched_at: new Date().toISOString(),
    notes: 'Демонстрационное дело: карточка после установочной встречи.',
  })

  await запрос('POST', 'contacts', [
    { case_id: дело.id, kind: 'student', name: 'Алиса Рожкова', can_decide: true },
    { case_id: дело.id, kind: 'parent', name: 'Ольга Рожкова', can_decide: true },
  ])

  const [источник] = await запрос<{ id: string }>('POST', 'sources', {
    case_id: дело.id,
    kind: 'meeting',
    ref: { встреча: 'установочная, Zoom', длительность: '52 минуты' },
    note: 'Установочная встреча: разобрали цель, бюджет, сроки и документы.',
  })

  await запрос(
    'POST',
    'facts',
    ФАКТЫ.map((ф) => ({
      case_id: дело.id,
      field: ф.field,
      value: ф.value,
      currency: ф.currency ?? null,
      is_plan: ф.is_plan ?? false,
      speaker: 'student',
      quote: ф.quote,
      source_id: источник.id,
      status: 'confirmed',
      confirmed_by: руководитель.id,
      confirmed_at: new Date().toISOString(),
    }))
  )

  await запрос(
    'POST',
    'tasks',
    ЗАДАЧИ.map((з) => ({
      case_id: дело.id,
      title: з.title,
      details: з.details ?? null,
      waiting_on: з.waiting_on,
      due_on: з.due_on,
      status: з.status,
      assignee_member_id: руководитель.id,
    }))
  )

  await запрос('POST', 'events', {
    actor_kind: 'member',
    actor_id: руководитель.id,
    case_id: дело.id,
    action: 'demo_case_seeded',
    after: { фактов: ФАКТЫ.length, задач: ЗАДАЧИ.length },
    source: { script: 'scripts/care/seed-demo.ts' },
    reason: 'демонстрационное дело после установочной встречи',
  })

  console.log(`\n✓ Заведено: ${дело.id}`)
  console.log('  Карточка: /care/cases/' + дело.id)
  console.log('  Дальше: попросите помощника «собери подборку» и «напиши стратегию».')
}

async function main() {
  if (!SUPA || !ANON || !KEY) {
    console.error('Нет NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY или CARE_DB_KEY в .env.local')
    process.exit(1)
  }

  const применить = process.argv.includes('--применить') || process.argv.includes('--apply')
  try {
    if (process.argv.includes('--убрать')) await убрать(применить)
    else await завести(применить)
  } catch (e) {
    console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }
}

main()
