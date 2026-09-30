// Перевести клиента на новый кабинет — и вернуть обратно.
//
//   npx tsx scripts/care/switch-client.ts --вкл <case_id>              # предпросмотр
//   npx tsx scripts/care/switch-client.ts --вкл <case_id> --применить
//   npx tsx scripts/care/switch-client.ts --выкл <case_id> --применить
//   npx tsx scripts/care/switch-client.ts --список                     # кто где
//
// Переключение — по одному клиенту и обратимо. Это то место, где решается,
// какая система ведёт человека: пока `automation_owner = 'legacy'`,
// автоматика нового контура его не видит вовсе.
//
// ЧЕК-ЛИСТ ВКЛЮЧЕНИЯ (раздел 5 плана). Скрипт проверяет и отказывается
// переключать, если что-то не готово:
//   1. дело существует, владелец назначен
//   2. у контакта студента заполнен чат Телеграма
//   3. история переписки перенесена в care.sources
//   4. флаги ui и ai включены владельцу дела
//
// Для тестовых дел проверки 2 и 3 пропускаются: чата у них нет по построению,
// и переписываться там не с кем.
//
// ВЫКЛЮЧЕНИЕ не удаляет данные. Оно останавливает автоматику: незавершённые
// задания отменяются, ждущие предложения гасятся, очередь отправки чистится.
// Уже отправленное остаётся фактом — его не отменить.
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

type Дело = {
  id: string
  client_id: number
  automation_owner: string
  owner_member_id: string | null
  is_synthetic: boolean
  synthetic_name: string | null
  switched_at: string | null
}

async function показатьСписок() {
  const дела = await запрос<Дело>(
    'care',
    'GET',
    'cases?select=id,client_id,automation_owner,owner_member_id,is_synthetic,synthetic_name,switched_at&order=automation_owner'
  )
  const наV2 = дела.filter((д) => д.automation_owner === 'v2')
  console.log(`\nВсего дел: ${дела.length} · на новом кабинете: ${наV2.length}\n`)
  for (const д of наV2) {
    const имя = д.synthetic_name ?? `клиент #${д.client_id}`
    console.log(`  v2   ${д.id.slice(0, 8)}  ${имя}${д.is_synthetic ? '  (тестовое)' : ''}`)
  }
  if (!наV2.length) console.log('  Ни одно дело не переведено на новый кабинет.')
}

async function включить(caseId: string, писать: boolean) {
  const [дело] = await запрос<Дело>(
    'care',
    'GET',
    `cases?select=id,client_id,automation_owner,owner_member_id,is_synthetic,synthetic_name,switched_at&id=eq.${caseId}`
  )
  if (!дело) { console.error('Дела с таким id нет'); process.exit(1) }

  const имя = дело.synthetic_name ?? `клиент #${дело.client_id}`
  console.log(`\n${писать ? 'ПЕРЕКЛЮЧАЮ' : 'ПРОВЕРКА'}: ${имя}${дело.is_synthetic ? ' (тестовое дело)' : ''}\n`)

  if (дело.automation_owner === 'v2') {
    console.log('  = уже на новом кабинете с ' + (дело.switched_at?.slice(0, 10) ?? 'неизвестной даты'))
    return
  }

  const беды: string[] = []

  if (!дело.owner_member_id) беды.push('у дела не назначен владелец')

  if (!дело.is_synthetic) {
    const контакты = await запрос<{ tg_chat_id: number | null }>(
      'care', 'GET', `contacts?select=tg_chat_id&case_id=eq.${caseId}&kind=eq.student`
    )
    if (!контакты.some((к) => к.tg_chat_id != null)) {
      беды.push('у контакта студента не заполнен чат Телеграма — привязать: link-chats.ts')
    }

    const источники = await запрос<{ id: string }>(
      'care', 'GET', `sources?select=id&case_id=eq.${caseId}&kind=eq.message`
    )
    if (!источники.length) {
      беды.push('история переписки не перенесена — перенести: import-history.ts')
    }
  } else {
    console.log('  ⓘ тестовое дело: проверки чата и истории пропущены')
  }

  if (дело.owner_member_id) {
    const флаги = await запрос<{ flag: string; enabled: boolean }>(
      'care', 'GET', `feature_flags?select=flag,enabled&scope=eq.curator&scope_id=eq.${дело.owner_member_id}`
    )
    for (const нужен of ['ui', 'ai']) {
      if (!флаги.some((ф) => ф.flag === нужен && ф.enabled)) {
        беды.push(`владельцу дела не включён флаг ${нужен} — setup-team.ts --флаг ${нужен} --кому <id>`)
      }
    }
  }

  if (беды.length) {
    console.log('  Переключать рано:')
    for (const б of беды) console.log(`    ✗ ${б}`)
    process.exit(1)
  }

  console.log('  ✓ владелец назначен')
  if (!дело.is_synthetic) console.log('  ✓ чат привязан, история перенесена')
  console.log('  ✓ флаги ui и ai включены владельцу')

  if (!писать) {
    console.log('\nЭто проверка. Чтобы переключить, добавь --применить')
    return
  }

  await запрос('care', 'PATCH', `cases?id=eq.${caseId}`, {
    automation_owner: 'v2',
    switched_at: new Date().toISOString(),
  })

  await запрос('care', 'POST', 'events', {
    actor_kind: 'system',
    case_id: caseId,
    action: 'switched_to_v2',
    before: { automation_owner: 'legacy' },
    after: { automation_owner: 'v2' },
    source: { script: 'scripts/care/switch-client.ts' },
    reason: 'перевод клиента на новый кабинет',
  })

  console.log('\n✓ Переведено на новый кабинет.')
  console.log('  Старый кабинет для этого клиента теперь только для просмотра — это дисциплина,')
  console.log('  а не запрет: мы его не меняли. Расхождения будут видны в журнале.')
}

async function выключить(caseId: string, писать: boolean) {
  const [дело] = await запрос<Дело>(
    'care', 'GET', `cases?select=id,client_id,automation_owner,is_synthetic,synthetic_name&id=eq.${caseId}`
  )
  if (!дело) { console.error('Дела с таким id нет'); process.exit(1) }

  const имя = дело.synthetic_name ?? `клиент #${дело.client_id}`
  console.log(`\n${писать ? 'ВОЗВРАЩАЮ' : 'ПРЕДПРОСМОТР'}: ${имя}`)

  if (дело.automation_owner !== 'v2') {
    console.log('  = дело и так ведёт старый кабинет')
    return
  }

  const [задания, предложения] = await Promise.all([
    запрос<{ id: string }>('care', 'GET', `jobs?select=id&case_id=eq.${caseId}&status=in.(queued,running)`),
    запрос<{ id: string }>('care', 'GET', `proposals?select=id&case_id=eq.${caseId}&status=eq.pending`),
  ])

  console.log(`  заданий в работе: ${задания.length}`)
  console.log(`  предложений ждут решения: ${предложения.length}`)

  if (!писать) {
    console.log('\nЭто предпросмотр. Чтобы вернуть, добавь --применить')
    return
  }

  if (задания.length) {
    await запрос('care', 'PATCH', `jobs?case_id=eq.${caseId}&status=in.(queued,running)`, { status: 'cancelled' })
  }
  if (предложения.length) {
    await запрос('care', 'PATCH', `proposals?case_id=eq.${caseId}&status=eq.pending`, { status: 'expired' })
    for (const п of предложения) {
      await запрос('care', 'PATCH', `outbound_actions?proposal_id=eq.${п.id}&status=eq.queued`, {
        status: 'cancelled',
        cancel_reason: 'client_switched_back',
      })
    }
  }

  await запрос('care', 'PATCH', `cases?id=eq.${caseId}`, { automation_owner: 'legacy' })
  await запрос('care', 'POST', 'events', {
    actor_kind: 'system',
    case_id: caseId,
    action: 'switched_to_legacy',
    before: { automation_owner: 'v2' },
    after: { automation_owner: 'legacy' },
    source: { script: 'scripts/care/switch-client.ts' },
    reason: 'возврат клиента на старый кабинет',
  })

  console.log('\n✓ Возвращено старому кабинету.')
  console.log('  Данные контура не удалены. Уже отправленное остаётся фактом — его не отменить.')
}

async function main() {
  if (!SUPA || !ANON || !KEY) {
    console.error('Нужны NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY и CARE_DB_KEY')
    process.exit(1)
  }

  const писать = process.argv.includes('--применить')

  if (process.argv.includes('--список')) return показатьСписок()

  const вкл = аргумент('вкл')
  const выкл = аргумент('выкл')

  if (вкл) return включить(вкл, писать)
  if (выкл) return выключить(выкл, писать)

  console.error('npx tsx scripts/care/switch-client.ts --вкл <case_id> | --выкл <case_id> | --список')
  process.exit(1)
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e)
  process.exit(1)
})
