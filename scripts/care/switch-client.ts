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
// ЧЕК-ЛИСТ ВКЛЮЧЕНИЯ (раздел 5 плана) живёт в `lib/care/switch.ts` и общий с
// экраном `/care/admin/switch`. Скрипт его только показывает и исполняет: два
// списка проверок разъехались бы, и экран однажды перевёл бы клиента, которого
// скрипт переводить отказался.
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
  const { готовность, перевестиНаV2 } = await import('../../lib/care/switch')

  const г = await готовность(caseId)
  if (!г) { console.error('Дела с таким id нет'); process.exit(1) }

  console.log(`\n${писать ? 'ПЕРЕКЛЮЧАЮ' : 'ПРОВЕРКА'}: ${г.имя}${г.is_synthetic ? ' (тестовое дело)' : ''}\n`)

  if (г.наV2) {
    console.log('  = уже на новом кабинете с ' + (г.switched_at?.slice(0, 10) ?? 'неизвестной даты'))
    return
  }

  for (const п of г.пункты) {
    console.log(`  ${п.ok ? '✓' : '✗'} ${п.пункт}`)
    if (!п.ok && п.подсказка) console.log(`      ${п.подсказка}`)
  }

  if (!г.готово) {
    console.log('\nПереключать рано.')
    process.exit(1)
  }

  if (!писать) {
    console.log('\nЭто проверка. Чтобы переключить, добавь --применить')
    return
  }

  const итог = await перевестиНаV2(caseId, {
    actor_kind: 'system',
    откуда: 'scripts/care/switch-client.ts',
  })
  if (!итог.ok) { console.error(`\n✗ ${итог.ошибка}`); process.exit(1) }
  console.log(`\n✓ ${итог.текст}`)
}

async function выключить(caseId: string, писать: boolean) {
  const { вернутьНаLegacy } = await import('../../lib/care/switch')

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

  const итог = await вернутьНаLegacy(caseId, {
    actor_kind: 'system',
    откуда: 'scripts/care/switch-client.ts',
  })
  if (!итог.ok) { console.error(`\n✗ ${итог.ошибка}`); process.exit(1) }
  console.log(`\n✓ ${итог.текст}`)
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
