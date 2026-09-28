// Завести сотрудников контура: руководителя и команду.
//
//   npx tsx scripts/care/setup-team.ts --руководитель <user_id>              # предпросмотр
//   npx tsx scripts/care/setup-team.ts --руководитель <user_id> --применить
//   npx tsx scripts/care/setup-team.ts --флаг-ui <member_id|user_id>         # включить кабинет
//
// Читает рабочие таблицы, пишет только в care. Повторный запуск не плодит
// дублей: user_id в care.members уникален, скрипт сверяется до вставки.
//
// Кураторы без учётной записи (curators.user_id пуст) пропускаются — сотрудника
// контура не к чему привязать. Это чинится в действующей CRM, не здесь.
import { config } from 'dotenv'
import path from 'path'

config({ path: path.resolve(process.cwd(), '.env.local') })

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const KEY = process.env.CARE_DB_KEY

function аргумент(имя: string): string | null {
  const i = process.argv.indexOf(`--${имя}`)
  if (i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1]
  return null
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

type Участник = { id: string; user_id: string; care_role: string; team_lead_id: string | null }

async function найтиИлиЗавести(
  user_id: string,
  роль: string,
  руководитель: string | null,
  писать: boolean
): Promise<Участник | null> {
  const есть = await запрос<Участник>('care', 'GET', `members?select=id,user_id,care_role,team_lead_id&user_id=eq.${user_id}`)
  if (есть.length) return есть[0]
  if (!писать) return null
  const создан = await запрос<Участник>('care', 'POST', 'members', {
    user_id,
    care_role: роль,
    team_lead_id: руководитель,
  })
  return создан[0]
}

async function включитьФлаг(memberId: string, писать: boolean): Promise<'уже' | 'включён' | 'будет'> {
  const есть = await запрос<{ id: string; enabled: boolean }>(
    'care',
    'GET',
    `feature_flags?select=id,enabled&scope=eq.curator&scope_id=eq.${memberId}&flag=eq.ui`
  )
  if (есть.length && есть[0].enabled) return 'уже'
  if (!писать) return 'будет'
  if (есть.length) {
    await запрос('care', 'PATCH', `feature_flags?id=eq.${есть[0].id}`, { enabled: true })
  } else {
    await запрос('care', 'POST', 'feature_flags', { scope: 'curator', scope_id: memberId, flag: 'ui', enabled: true })
  }
  return 'включён'
}

async function main() {
  if (!SUPA || !ANON || !KEY) {
    console.error('Нужны NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY и CARE_DB_KEY')
    process.exit(1)
  }

  const писать = process.argv.includes('--применить')
  const руководительUser = аргумент('руководитель')
  const флагДля = аргумент('флаг-ui')

  // Отдельный режим: только включить кабинет уже заведённому сотруднику.
  if (флагДля && !руководительUser) {
    // Принимаем и id сотрудника контура, и user_id из CRM: под рукой обычно
    // оказывается второй, а помнить, какой именно нужен, — лишняя работа.
    const участники = await запрос<Участник>(
      'care',
      'GET',
      `members?select=id,user_id,care_role&or=(id.eq.${флагДля},user_id.eq.${флагДля})`
    )
    if (!участники.length) {
      console.error('Такого сотрудника в контуре нет. Сначала заведи команду.')
      process.exit(1)
    }
    const итог = await включитьФлаг(участники[0].id, писать)
    console.log(`Флаг ui для ${участники[0].id} (${участники[0].care_role}): ${итог}`)
    if (!писать) console.log('Это предпросмотр. Добавь --применить')
    return
  }

  if (!руководительUser) {
    console.error('Укажи --руководитель <user_id> или --флаг-ui <id>')
    process.exit(1)
  }

  // ── Руководитель ─────────────────────────────────────────────────────────
  const [кто] = await запрос<{ id: string; name: string | null; role: string }>(
    'public',
    'GET',
    `users?select=id,name,role&id=eq.${руководительUser}`
  )
  if (!кто) {
    console.error('Пользователя с таким id нет')
    process.exit(1)
  }

  console.log(`\n${писать ? 'ПРИМЕНЯЮ' : 'ПРЕДПРОСМОТР'}\n`)
  console.log(`Руководитель: ${кто.name ?? кто.id} (роль в CRM: ${кто.role})`)

  const руководитель = await найтиИлиЗавести(кто.id, 'lead', null, писать)
  if (руководитель && руководитель.care_role !== 'lead' && писать) {
    await запрос('care', 'PATCH', `members?id=eq.${руководитель.id}`, { care_role: 'lead', team_lead_id: null })
    console.log('  роль повышена до lead')
  }

  // ── Команда ──────────────────────────────────────────────────────────────
  const кураторы = await запрос<{ id: string; name: string | null; user_id: string | null }>(
    'public',
    'GET',
    'curators?select=id,name,user_id&is_active=eq.true'
  )

  const сУчёткой = кураторы.filter((к) => k(к.user_id))
  const безУчётки = кураторы.filter((к) => !k(к.user_id))

  console.log(`\nАктивных кураторов: ${кураторы.length} · с учётной записью: ${сУчёткой.length}`)

  for (const к of сУчёткой) {
    if (к.user_id === кто.id) continue
    const уже = await запрос<Участник>('care', 'GET', `members?select=id,care_role&user_id=eq.${к.user_id}`)
    if (уже.length) {
      console.log(`  = ${(к.name ?? '?').padEnd(16)} уже в контуре (${уже[0].care_role})`)
      continue
    }
    if (писать && руководитель) {
      await найтиИлиЗавести(к.user_id!, 'curator', руководитель.id, true)
      console.log(`  + ${(к.name ?? '?').padEnd(16)} заведён куратором`)
    } else {
      console.log(`  + ${(к.name ?? '?').padEnd(16)} будет заведён куратором`)
    }
  }

  if (безУчётки.length) {
    console.log(`\nПропущены — нет учётной записи в CRM: ${безУчётки.map((к) => к.name ?? '?').join(', ')}`)
    console.log('  Сотрудника контура не к чему привязать. Чинится в действующей CRM.')
  }

  if (!писать) console.log('\nЭто предпросмотр. Чтобы записать, добавь --применить')
}

/** Пустая строка и null — одно и то же: учётки нет. */
function k(v: string | null | undefined): v is string {
  return !!v && v.trim().length > 0
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e)
  process.exit(1)
})
