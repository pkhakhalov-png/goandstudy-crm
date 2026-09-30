// Расписание воркера кабинета v2 — включить, выключить, посмотреть.
//
//   npx tsx scripts/care/schedule.ts --состояние
//   npx tsx scripts/care/schedule.ts --вкл --адрес https://<хост>/api/care/tick   # предпросмотр
//   npx tsx scripts/care/schedule.ts --вкл --адрес https://<хост>/api/care/tick --применить
//   npx tsx scripts/care/schedule.ts --выкл --применить
//
// Шаг 6 `docs/care/OWNER_SETUP.md` одной командой. Раньше это были шесть
// действий в двух панелях: адрес в care.settings, секрет в Vault, вызов
// care.schedule_all(). Шесть действий руками — это шесть мест, где можно
// опечататься и потом искать, почему воркер не зовётся.
//
// ЧТО ПРОВЕРЯЕТСЯ ДО ВКЛЮЧЕНИЯ, И ПОЧЕМУ ИМЕННО ЭТО:
//
//   1. Адрес отвечает нашим маршрутом, а не защитой Vercel. Запрос без секрета
//      обязан дать 401 от нас. Если пришло 302 на SSO — адрес закрыт
//      Deployment Protection, и расписание будет молча стучаться в пустоту
//      каждую минуту. На эти грабли уже наступал скрипт вебхука.
//   2. Запрос с секретом обязан дать 200. Иначе секрет в базе и секрет в
//      Vercel разные, и это выяснилось бы только по пустой очереди.
//
// Расписание ставит два задания cron: `care_tick` раз в минуту и
// `care_enqueue` раз в пять минут (миграция 012). Второе — то, что вообще
// кладёт работу в очередь; без него тик крутится вхолостую.
import { config } from 'dotenv'
import path from 'path'

config({ path: path.resolve(process.cwd(), '.env.local') })

const REF =
  process.env.SUPABASE_PROJECT_REF ||
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
const ТОКЕН = process.env.SUPABASE_ACCESS_TOKEN
const СЕКРЕТ = process.env.CARE_TICK_SECRET
const ОБХОД = process.env.CARE_VERCEL_BYPASS

function аргумент(имя: string): string | null {
  const i = process.argv.indexOf(`--${имя}`)
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null
}
const есть = (имя: string) => process.argv.includes(`--${имя}`)

/** Одиночные кавычки в SQL-литерале. Секрет шестнадцатеричный, но гадать незачем. */
const строкой = (s: string) => `'${s.replaceAll("'", "''")}'`

async function sql<T = Record<string, unknown>>(запрос: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ТОКЕН}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: запрос }),
  })
  const текст = await r.text()
  if (!r.ok) throw new Error(`SQL → ${r.status}: ${текст.slice(0, 300)}`)
  return текст ? (JSON.parse(текст) as T[]) : []
}

/**
 * Адрес с обходом защиты превью.
 *
 * Обход идёт параметром адреса и **без** `x-vercel-set-bypass-cookie`: с ним
 * Vercel отвечает 307, а pg_net, как и Телеграм, за редиректами не ходит.
 */
function сОбходом(адрес: string): string {
  if (!ОБХОД) return адрес
  const u = new URL(адрес)
  if (!u.searchParams.has('x-vercel-protection-bypass')) {
    u.searchParams.set('x-vercel-protection-bypass', ОБХОД)
  }
  return u.toString()
}

async function проверитьАдрес(адрес: string): Promise<void> {
  console.log(`\nПроверяю адрес — ${адрес.replace(/x-vercel-protection-bypass=[^&]+/, 'x-vercel-protection-bypass=…')}`)

  const без = await fetch(адрес, { method: 'POST', redirect: 'manual' })
  if (без.status === 302 || без.status === 307) {
    const куда = без.headers.get('location') ?? ''
    throw new Error(
      `адрес отвечает ${без.status} на ${куда.slice(0, 60)} — это защита Vercel, а не наш маршрут.\n` +
        `  Расписание стучалось бы в пустоту каждую минуту. Нужен CARE_VERCEL_BYPASS в .env.local.`
    )
  }
  if (без.status !== 401) {
    throw new Error(`запрос без секрета дал ${без.status}, а должен 401. Маршрут не тот или секрет не настроен.`)
  }
  console.log('  ✓ без секрета — 401, отвечает наш маршрут')

  const с = await fetch(адрес, {
    method: 'POST',
    headers: { 'x-care-tick-secret': СЕКРЕТ!, 'Content-Type': 'application/json' },
    body: '{}',
    redirect: 'manual',
  })
  const тело = await с.text()
  if (с.status !== 200) {
    throw new Error(`запрос с секретом дал ${с.status}: ${тело.slice(0, 200)}\n  Секрет в .env.local и в Vercel разные?`)
  }
  console.log(`  ✓ с секретом — 200, ${тело.slice(0, 120)}`)
}

async function состояние(): Promise<void> {
  const [адрес] = await sql<{ value: string }>(
    `select value #>> '{}' as value from care.settings where key = 'tick_url'`
  )
  const [секрет] = await sql<{ есть: boolean }>(
    `select exists (select 1 from vault.secrets where name = 'CARE_TICK_SECRET') as "есть"`
  )
  const задания = await sql<{ jobname: string; schedule: string; active: boolean }>(
    `select jobname, schedule, active from cron.job where jobname in ('care_tick', 'care_enqueue') order by jobname`
  )
  const очередь = await sql<{ kind: string; status: string; сколько: number }>(
    `select kind, status, count(*)::int as "сколько" from care.jobs group by kind, status order by kind`
  )
  // Последние запуски cron: «расписание стоит» и «расписание работает» — разные
  // утверждения. Второе видно только здесь.
  const запуски = await sql<{ jobname: string; status: string; когда: string; сообщение: string | null }>(
    `select j.jobname, d.status, to_char(d.start_time, 'HH24:MI:SS') as "когда",
            nullif(d.return_message, '') as "сообщение"
       from cron.job_run_details d
       join cron.job j on j.jobid = d.jobid
      where j.jobname in ('care_tick', 'care_enqueue')
      order by d.start_time desc
      limit 6`
  )

  console.log('\nАдрес воркера: ' + (адрес?.value
    ? адрес.value.replace(/x-vercel-protection-bypass=[^&]+/, 'x-vercel-protection-bypass=…')
    : '— не записан'))
  console.log('Секрет в Vault: ' + (секрет?.есть ? 'есть' : '— нет'))
  console.log('Расписание: ' + (задания.length
    ? задания.map((з) => `${з.jobname} «${з.schedule}»${з.active ? '' : ' (выключено)'}`).join(', ')
    : '— не включено'))
  console.log('Очередь: ' + (очередь.length
    ? очередь.map((о) => `${о.kind}/${о.status} — ${о.сколько}`).join(', ')
    : 'пусто'))
  console.log('Последние запуски cron:')
  if (!запуски.length) console.log('  — ни одного')
  for (const з of запуски) {
    console.log(`  ${з.когда}  ${з.jobname.padEnd(13)} ${з.status}${з.сообщение ? ' — ' + з.сообщение.slice(0, 80) : ''}`)
  }
}

async function включить(адрес: string, применить: boolean): Promise<void> {
  if (!СЕКРЕТ) throw new Error('Нет CARE_TICK_SECRET в .env.local — тот же, что в Vercel')
  const полный = сОбходом(адрес)

  await проверитьАдрес(полный)

  if (!применить) {
    console.log('\nПредпросмотр. С --применить будет сделано:')
    console.log('  1. care.settings.tick_url ← адрес выше')
    console.log('  2. Vault: секрет CARE_TICK_SECRET (создать или обновить)')
    console.log('  3. select care.schedule_all() — care_tick раз в минуту, care_enqueue раз в пять минут')
    return
  }

  console.log('\nЗаписываю адрес…')
  await sql(
    `insert into care.settings (key, value)
     values ('tick_url', to_jsonb(${строкой(полный)}::text))
     on conflict (key) do update set value = excluded.value, updated_at = now()`
  )

  console.log('Кладу секрет в Vault…')
  // create_secret на существующем имени падает уникальностью, поэтому сначала
  // смотрим, есть ли он, и обновляем — иначе повторный запуск ломался бы.
  const [был] = await sql<{ id: string }>(`select id from vault.secrets where name = 'CARE_TICK_SECRET'`)
  if (был?.id) {
    await sql(`select vault.update_secret(${строкой(был.id)}::uuid, ${строкой(СЕКРЕТ)})`)
  } else {
    await sql(
      `select vault.create_secret(${строкой(СЕКРЕТ)}, 'CARE_TICK_SECRET', 'Секрет воркера кабинета v2')`
    )
  }

  console.log('Включаю расписание…')
  await sql(`select care.schedule_all()`)

  await состояние()
  console.log('\n✓ Расписание включено. Выключить: --выкл --применить')
}

async function выключить(применить: boolean): Promise<void> {
  if (!применить) {
    console.log('\nПредпросмотр. С --применить будет вызван care.unschedule_all() — оба задания cron снимутся.')
    console.log('Адрес и секрет останутся на месте: включить обратно можно будет одной командой.')
    return
  }
  await sql(`select care.unschedule_all()`)
  await состояние()
  console.log('\n✓ Расписание выключено. Очередь работает только по ручному вызову.')
}

async function main() {
  if (!ТОКЕН) {
    console.error('Нет SUPABASE_ACCESS_TOKEN в .env.local — без него ни Vault, ни cron не тронуть')
    process.exit(1)
  }
  if (!REF) {
    console.error('Не определился ref проекта')
    process.exit(1)
  }

  const применить = есть('применить')

  try {
    if (есть('состояние')) return await состояние()

    if (есть('вкл')) {
      const адрес = аргумент('адрес') ?? process.env.CARE_TICK_URL ?? null
      if (!адрес) {
        console.error(
          'Укажи адрес воркера: --адрес https://<хост>/api/care/tick\n' +
            'Для ветки feat/curator-v2 это branch alias превью; обход защиты добавится сам из CARE_VERCEL_BYPASS.'
        )
        process.exit(1)
      }
      return await включить(адрес, применить)
    }

    if (есть('выкл')) return await выключить(применить)

    console.log(
      'Что делать:\n' +
        '  --состояние                       адрес, секрет, расписание, очередь\n' +
        '  --вкл --адрес <url> [--применить] включить\n' +
        '  --выкл [--применить]              выключить'
    )
  } catch (e) {
    console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }
}

main()
