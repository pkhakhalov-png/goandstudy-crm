// Проверка изоляции: чего ключ кабинета v2 НЕ может сделать с рабочими данными.
//
// Запускать после каждой миграции, трогающей права:
//   npx tsx scripts/care/selftest-perms.ts
//
// Все запросы идут через тот же PostgREST, что и приложение, тем же ключом.
// Ни один из них не должен изменить ни одной строки в public.
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.CARE_DB_KEY!
// Шлюз Supabase принимает в заголовке apikey только anon или service_role, а роль
// берёт из Authorization. Поэтому anon здесь — пропуск на входе, а не права:
// всё, что можно сделать дальше, определяет роль care_app из CARE_DB_KEY.
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

type Ожидание = 'разрешено' | 'запрещено'

async function запрос(метод: string, путь: string, тело?: object, схема?: string) {
  const h: Record<string, string> = { apikey: ANON, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
  if (схема) h[метод === 'GET' ? 'Accept-Profile' : 'Content-Profile'] = схема
  const r = await fetch(`${URL}/rest/v1/${путь}`, { method: метод, headers: h, body: тело ? JSON.stringify(тело) : undefined })
  return { код: r.status, текст: (await r.text()).slice(0, 160) }
}

/** Запрос анонимным ключом — тем, что доступен любому посетителю сайта. */
async function анонимно(метод: string, путь: string, тело?: object) {
  const h: Record<string, string> = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }
  h[метод === 'GET' ? 'Accept-Profile' : 'Content-Profile'] = 'care'
  const r = await fetch(`${URL}/rest/v1/${путь}`, { method: метод, headers: h, body: тело ? JSON.stringify(тело) : undefined })
  return { код: r.status, текст: (await r.text()).slice(0, 160) }
}

const проверки: { имя: string; ожидание: Ожидание; выполнить: () => Promise<{ код: number; текст: string }> }[] = [
  { имя: 'чтение клиентов', ожидание: 'разрешено',
    выполнить: () => запрос('GET', 'clients?select=id,name&limit=1') },
  { имя: 'ИЗМЕНЕНИЕ имени клиента', ожидание: 'запрещено',
    выполнить: () => запрос('PATCH', 'clients?id=eq.1', { name: 'проверка изоляции' }) },
  { имя: 'СОЗДАНИЕ клиента', ожидание: 'запрещено',
    выполнить: () => запрос('POST', 'clients', { name: 'проверка изоляции', months: 1 }) },
  { имя: 'УДАЛЕНИЕ клиента', ожидание: 'запрещено',
    выполнить: () => запрос('DELETE', 'clients?id=eq.999999') },
  { имя: 'чтение платежей', ожидание: 'запрещено',
    выполнить: () => запрос('GET', 'payments?select=id&limit=1') },
  { имя: 'чтение расходов', ожидание: 'запрещено',
    выполнить: () => запрос('GET', 'expenses?select=id&limit=1') },
  // id у подборки — uuid: фильтр по единице дал бы 400 от разбора, и проверка
  // доказывала бы опечатку вместо отказа в правах.
  { имя: 'изменение подборки вузов', ожидание: 'запрещено',
    выполнить: () => запрос('PATCH', 'client_universities?id=eq.00000000-0000-0000-0000-000000000000', { status: 'rejected' }) },
  { имя: 'изменение этапа клиента', ожидание: 'запрещено',
    выполнить: () => запрос('PATCH', 'clients?id=eq.1', { current_stage_code: 'visa' }) },

  // Схема care открыта для API, поэтому отдельно проверяем, что открыта она
  // только для своей роли. Анонимный ключ — тот самый, что лежит в браузере
  // у любого посетителя сайта.
  { имя: 'анонимом: чтение care', ожидание: 'запрещено',
    выполнить: () => анонимно('GET', 'env_marker?select=*') },
  { имя: 'анонимом: запись в care', ожидание: 'запрещено',
    выполнить: () => анонимно('POST', 'env_marker', { id: true, mode: 'prod', external_sends: true }) },
]

async function main() {
  if (!KEY) { console.error('Нет CARE_DB_KEY в .env.local — сначала npx tsx scripts/care/mint-key.ts --записать'); process.exit(1) }
  let провалов = 0
  for (const п of проверки) {
    const { код, текст } = await п.выполнить()
    const разрешено = код >= 200 && код < 300
    const верно = (п.ожидание === 'разрешено') === разрешено
    if (!верно) провалов++
    const метка = верно ? '✓' : '✗ ПРОВАЛ'
    const что = разрешено ? 'прошло' : `отказано (${код})`
    console.log(`${метка}  ${п.имя.padEnd(32)} ожидали: ${п.ожидание.padEnd(10)} получили: ${что}`)
    if (!верно) console.log(`        ответ: ${текст}`)
  }
  console.log(провалов === 0
    ? '\n✓ Изоляция держится: рабочие данные ключом кабинета v2 не изменить.'
    : `\n✗ ${провалов} проверок провалено — работать с этим ключом нельзя.`)
  process.exit(провалов === 0 ? 0 : 1)
}

main()
