// Диагностика каналов связи: где на самом деле лежит переписка с клиентами.
//
//   npx tsx scripts/care/channels-report.ts
//   npx tsx scripts/care/channels-report.ts --дней 30
//
// ТОЛЬКО ЧТЕНИЕ. Ни одного INSERT/UPDATE/DELETE — запросы идут через
// Management API под postgres, поэтому ограничение здесь дисциплинарное, а
// не техническое: все запросы в файле начинаются с select, и так и должно
// остаться.
//
// Зачем этот скрипт есть. Вопрос «на каком канале возможен пилот» нельзя
// решить по ощущениям: у клиента может быть группа в Телеграме, но не быть
// привязки к карточке, и тогда переписка лежит в сделке, а в кабинете
// куратора её не видно. Разница между «группы нет» и «группа есть, но не
// привязана» стоит недель работы, и выясняется она одним запросом.
import { config } from 'dotenv'
import path from 'path'

config({ path: path.resolve(process.cwd(), '.env.local') })

const ТОКЕН = process.env.SUPABASE_ACCESS_TOKEN
const REF =
  process.env.SUPABASE_PROJECT_REF ||
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]

const ДНЕЙ = Number(
  process.argv[process.argv.indexOf('--дней') + 1] && process.argv.includes('--дней')
    ? process.argv[process.argv.indexOf('--дней') + 1]
    : 90
)

async function sql<T = Record<string, unknown>>(запрос: string): Promise<T[]> {
  if (!/^\s*(select|with)\b/i.test(запрос)) {
    throw new Error('Этот скрипт выполняет только select — проверь запрос')
  }
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ТОКЕН}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: запрос }),
  })
  const ответ = await r.json()
  if (!r.ok || (ответ && ответ.message)) {
    throw new Error(String(ответ?.message ?? r.status).slice(0, 300))
  }
  return ответ as T[]
}

function число(v: unknown): number {
  return Number(v ?? 0)
}

function заголовок(текст: string) {
  console.log(`\n${'─'.repeat(70)}\n${текст}\n${'─'.repeat(70)}`)
}

async function main() {
  if (!ТОКЕН || !REF) {
    console.error('Нужны SUPABASE_ACCESS_TOKEN и ref проекта в .env.local')
    process.exit(1)
  }

  console.log(`Диагностика каналов · окно ${ДНЕЙ} дней · проект ${REF}`)

  // ── 1. client_tg_messages ────────────────────────────────────────────────
  заголовок('1. client_tg_messages — переписка, видимая кабинету куратора')

  const [итог1] = await sql(`
    select
      count(*) as всего,
      count(distinct client_id) as клиентов,
      count(*) filter (where created_at > now() - interval '${ДНЕЙ} days') as за_окно,
      count(distinct client_id) filter (where created_at > now() - interval '${ДНЕЙ} days') as клиентов_за_окно,
      min(created_at) as самое_старое,
      max(created_at) as самое_новое,
      count(distinct tg_chat_id) as чатов
    from public.client_tg_messages`)

  console.log(`  сообщений всего:         ${число(итог1.всего)}`)
  console.log(`  клиентов с перепиской:   ${число(итог1.клиентов)}`)
  console.log(`  за ${ДНЕЙ} дней:               ${число(итог1.за_окно)} сообщений у ${число(итог1.клиентов_за_окно)} клиентов`)
  console.log(`  уникальных чатов:        ${число(итог1.чатов)}`)
  console.log(`  история с:               ${String(итог1.самое_старое ?? '—').slice(0, 10)} по ${String(итог1.самое_новое ?? '—').slice(0, 10)}`)

  const распределение = await sql(`
    select client_id, count(*) as сообщений,
           min(created_at) as с, max(created_at) as по
    from public.client_tg_messages group by 1 order by 2 desc`)
  console.log('\n  распределение по клиентам:')
  for (const р of распределение) {
    console.log(
      `    клиент ${String(р.client_id).padEnd(6)} ${String(число(р.сообщений)).padStart(4)} сообщ.  ${String(р.с).slice(0, 10)} … ${String(р.по).slice(0, 10)}`
    )
  }

  // ── 2. deal_messages ─────────────────────────────────────────────────────
  заголовок('2. deal_messages — переписка в воронке продаж')

  const поКаналам = await sql(`
    select
      coalesce(channel, 'без канала') as канал,
      count(*) as всего,
      count(*) filter (where created_at > now() - interval '${ДНЕЙ} days') as за_окно,
      count(distinct deal_id) as сделок,
      count(distinct deal_id) filter (where created_at > now() - interval '${ДНЕЙ} days') as сделок_за_окно,
      min(created_at) as самое_старое,
      max(created_at) as самое_новое
    from public.deal_messages group by 1 order by 2 desc`)

  for (const к of поКаналам) {
    console.log(`  ${String(к.канал).padEnd(14)} ${String(число(к.всего)).padStart(6)} сообщ. · ${String(число(к.сделок)).padStart(4)} сделок`)
    console.log(`  ${' '.repeat(14)} за ${ДНЕЙ} дн: ${число(к.за_окно)} сообщ. у ${число(к.сделок_за_окно)} сделок`)
    console.log(`  ${' '.repeat(14)} ${String(к.самое_старое).slice(0, 10)} … ${String(к.самое_новое).slice(0, 10)}`)
  }

  // ── 3. Сопоставление с клиентами ─────────────────────────────────────────
  заголовок('3. Клиенты: у кого переписка есть, у кого нет')

  const [итог3] = await sql(`
    with клиенты as (select id, tg_group_chat_id, phone_normalized from public.clients),
    через_кабинет as (select distinct client_id from public.client_tg_messages),
    через_сделки as (
      select distinct d.client_id
      from public.deals d join public.deal_messages m on m.deal_id = d.id
      where d.client_id is not null
    )
    select
      (select count(*) from клиенты) as всего_клиентов,
      (select count(*) from клиенты where tg_group_chat_id is not null) as с_привязкой,
      (select count(*) from клиенты k where exists (select 1 from через_кабинет t where t.client_id = k.id)) as есть_в_кабинете,
      (select count(*) from клиенты k where exists (select 1 from через_сделки s where s.client_id = k.id)) as есть_в_сделках,
      (select count(*) from клиенты k
         where exists (select 1 from через_кабинет t where t.client_id = k.id)
            or exists (select 1 from через_сделки s where s.client_id = k.id)) as есть_хоть_где,
      (select count(*) from клиенты k
         where not exists (select 1 from через_кабинет t where t.client_id = k.id)
           and not exists (select 1 from через_сделки s where s.client_id = k.id)) as нигде`)

  console.log(`  клиентов всего:                  ${число(итог3.всего_клиентов)}`)
  console.log(`  с привязанной группой:           ${число(итог3.с_привязкой)}`)
  console.log(`  переписка видна кабинету:        ${число(итог3.есть_в_кабинете)}`)
  console.log(`  переписка есть в сделках:        ${число(итог3.есть_в_сделках)}`)
  console.log(`  есть хоть где-то:                ${число(итог3.есть_хоть_где)}`)
  console.log(`  нет нигде:                       ${число(итог3.нигде)}`)

  // ── 4. Чаты: сколько их и сколько ничьих ─────────────────────────────────
  заголовок('4. Чаты Телеграма: сколько всего и сколько ничьих')

  // Группа опознаётся по metadata->>'chatType', а не по 'isGroup': такого
  // ключа в сообщениях нет. Первая версия этого скрипта искала его и
  // показывала «групп: 0» при 698 существующих — ровно та ошибка, ради
  // которой затевалась вся диагностика.
  const [итог4] = await sql(`
    with чаты as (
      select metadata->>'tgChatId' as chat_id,
             max(metadata->>'chatType') as тип,
             max(metadata->>'chatTitle') as название,
             min(created_at) as с, max(created_at) as по,
             count(*) as сообщений
      from public.deal_messages
      where metadata->>'tgChatId' is not null
      group by 1
    )
    select
      count(*) as всего_чатов,
      count(*) filter (where тип in ('group','supergroup')) as групп,
      count(*) filter (where тип = 'private') as личных,
      count(*) filter (where тип in ('group','supergroup') and по > now() - interval '${ДНЕЙ} days') as групп_живых,
      count(*) filter (where chat_id in (select tg_group_chat_id::text from public.clients where tg_group_chat_id is not null)) as привязано,
      min(с) as самое_старое, max(по) as самое_новое
    from чаты`)

  console.log(`  уникальных чатов:                ${число(итог4.всего_чатов)}`)
  console.log(`    групп и супергрупп:            ${число(итог4.групп)} (живых за ${ДНЕЙ} дн: ${число(итог4.групп_живых)})`)
  console.log(`    личных:                        ${число(итог4.личных)}`)
  console.log(`  привязано к карточке клиента:    ${число(итог4.привязано)}`)
  console.log(`  НЕ привязано:                    ${число(итог4.всего_чатов) - число(итог4.привязано)}`)
  console.log(`  история чатов:                   ${String(итог4.самое_старое).slice(0, 10)} … ${String(итог4.самое_новое).slice(0, 10)}`)

  // ── 5. Сколько групп можно привязать к клиентам ──────────────────────────
  заголовок('5. Сколько групп можно найти по имени клиента')

  // Автопривязка в старом вебхуке ищет в названии группы ТЕЛЕФОН. В наших
  // названиях телефонов нет вовсе — отсюда две привязки из семидесяти пяти.
  // Поэтому сопоставляем по имени и фамилии: слабее по надёжности, но
  // единственное, что здесь работает.
  const [телефоны] = await sql(`
    with г as (
      select distinct metadata->>'chatTitle' as название
      from public.deal_messages
      where metadata->>'chatType' in ('group','supergroup') and metadata->>'chatTitle' is not null
    )
    select count(*) as групп, count(*) filter (where название ~ '[0-9]{7,}') as с_телефоном from г`)

  console.log(`  групп с названием:               ${число(телефоны.групп)}`)
  console.log(`  из них с телефоном в названии:   ${число(телефоны.с_телефоном)}  ← по этому ищет автопривязка`)

  const [строго] = await sql(`
    with группы as (
      select metadata->>'tgChatId' as chat_id, max(metadata->>'chatTitle') as название, max(created_at) as последнее
      from public.deal_messages
      where metadata->>'chatType' in ('group','supergroup') and metadata->>'chatTitle' is not null
      group by 1
    ),
    имена as (
      select id, name, status, tg_group_chat_id,
             split_part(trim(name),' ',1) as ч1, split_part(trim(name),' ',2) as ч2
      from public.clients where name is not null and trim(name) <> ''
    ),
    совпало as (
      select distinct i.id, i.status, i.tg_group_chat_id
      from имена i join группы g
        on length(i.ч2) >= 4
       and g.название ilike '%' || i.ч1 || '%'
       and g.название ilike '%' || i.ч2 || '%'
      where g.последнее > now() - interval '${ДНЕЙ} days'
    )
    select
      (select count(*) from совпало) as найдено,
      (select count(*) from совпало where tg_group_chat_id is null) as нужна_привязка,
      (select count(*) from совпало where status = 'active') as активных_найдено,
      (select count(*) from имена where length(ч2) < 4) as без_фамилии,
      (select count(*) from public.clients where status = 'active') as активных_всего`)

  console.log(`\n  клиентов, чья группа найдена по ФИО: ${число(строго.найдено)}`)
  console.log(`    из них активных:                   ${число(строго.активных_найдено)} из ${число(строго.активных_всего)}`)
  console.log(`    нужна привязка chat_id:            ${число(строго.нужна_привязка)}`)
  console.log(`  клиентов без фамилии в карточке:     ${число(строго.без_фамилии)} — строго сопоставить нельзя`)

  заголовок('Готово. Ни одной записи не изменено.')
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e)
  process.exit(1)
})
