// Открыть схему care для API проекта — и уметь закрыть обратно.
//
//   npx tsx scripts/care/expose-schema.ts            # показать текущее состояние
//   npx tsx scripts/care/expose-schema.ts --открыть  # добавить care в список
//   npx tsx scripts/care/expose-schema.ts --закрыть  # убрать care из списка
//
// Почему это отдельная и осторожная операция. Список схем, открытых для API, —
// общая настройка проекта: в ней живут public, seo, content, finance. Запись
// идёт целой строкой, поэтому единственный способ навредить — отправить строку,
// в которой чего-то не хватает. Скрипт всегда читает текущее значение и
// дописывает к нему, никогда не собирает список заново.
//
// Изменение перезапускает PostgREST на несколько секунд: в этот момент рабочая
// CRM может ответить ошибкой. Поэтому запускать в согласованное время.
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

const REF = process.env.SUPABASE_PROJECT_REF
  || (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
const ТОКЕН = process.env.SUPABASE_ACCESS_TOKEN

async function настройки() {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/postgrest`, {
    headers: { Authorization: `Bearer ${ТОКЕН}` },
  })
  if (!r.ok) { console.error('Не прочитать настройки:', r.status, await r.text()); process.exit(1) }
  return await r.json() as { db_schema: string; db_extra_search_path: string; max_rows: number }
}

async function main() {
  if (!ТОКЕН || !REF) { console.error('Нужны SUPABASE_ACCESS_TOKEN и ref проекта'); process.exit(1) }

  const было = await настройки()
  const список = было.db_schema.split(',').map((s) => s.trim()).filter(Boolean)
  console.log(`Сейчас открыто: ${список.join(', ')}`)

  const открыть = process.argv.includes('--открыть')
  const закрыть = process.argv.includes('--закрыть')
  if (!открыть && !закрыть) { console.log('Ничего не менял. Ключи: --открыть | --закрыть'); return }

  // Настройка проекта и настройка роли живут отдельно и расходятся: первая —
  // то, что записано в панели, вторая — то, что читает работающий API. Поэтому
  // совпадение по первой не повод останавливаться, идём до второй.
  const стало = открыть
    ? (список.includes('care') ? список : [...список, 'care'])
    : список.filter((s) => s !== 'care')

  // Страховка от потери чужих схем: новый список обязан содержать все прежние,
  // кроме той единственной, которую мы осознанно убираем.
  const потеряны = список.filter((s) => s !== 'care' && !стало.includes(s))
  if (потеряны.length) { console.error('✗ Из списка пропали схемы:', потеряны.join(', ')); process.exit(1) }

  console.log(`Записываю: ${стало.join(', ')}`)
  console.log('Прежнее значение для отката: ' + было.db_schema)

  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/postgrest`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${ТОКЕН}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      db_schema: стало.join(','),
      db_extra_search_path: было.db_extra_search_path,
      max_rows: было.max_rows,
    }),
  })
  if (!r.ok) { console.error('✗', r.status, await r.text()); process.exit(1) }

  const теперь = await настройки()
  console.log(`✓ Настройки проекта: ${теперь.db_schema}`)

  // Живой PostgREST читает список не отсюда, а из настройки роли authenticator
  // (`pgrst.db_schemas`). Управляющий интерфейс разносит её не мгновенно, поэтому
  // дописываем сами — и снова только дописываем, к фактическому значению.
  const ролевой = await живойСписок()
  console.log(`Живой список API: ${ролевой.join(', ')}`)
  const ролевойСтал = открыть
    ? (ролевой.includes('care') ? ролевой : [...ролевой, 'care'])
    : ролевой.filter((s) => s !== 'care')
  const пропали = ролевой.filter((s) => s !== 'care' && !ролевойСтал.includes(s))
  if (пропали.length) { console.error('✗ Из живого списка пропали схемы:', пропали.join(', ')); process.exit(1) }

  await sql(`alter role authenticator set pgrst.db_schemas to '${ролевойСтал.join(', ')}'`)
  await sql(`notify pgrst, 'reload config'`)
  console.log(`✓ Живой список: ${ролевойСтал.join(', ')} — PostgREST перечитывает настройки`)
  console.log('Проверить: npx tsx scripts/care/smoke.ts')
}

/** Запрос к базе через управляющий интерфейс: роль postgres. */
async function sql(запрос: string) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ТОКЕН}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: запрос }),
  })
  if (!r.ok) { console.error('✗ Запрос не прошёл:', r.status, await r.text()); process.exit(1) }
  return await r.text()
}

/** Список схем, который читает работающий API прямо сейчас. */
async function живойСписок(): Promise<string[]> {
  const тело = await sql("select unnest(rolconfig) as c from pg_roles where rolname='authenticator'")
  const строки = JSON.parse(тело) as { c: string }[]
  const строка = строки.map((x) => x.c).find((c) => c.startsWith('pgrst.db_schemas='))
  if (!строка) { console.error('✗ Не нашёл pgrst.db_schemas у роли authenticator'); process.exit(1) }
  return строка.replace('pgrst.db_schemas=', '').split(',').map((s) => s.trim()).filter(Boolean)
}

main()
