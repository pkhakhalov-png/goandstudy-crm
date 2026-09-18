// Применить SQL к базе через Management API.
//
//   npx tsx scripts/apply-sql.ts supabase/migrations/20260918000000_freshness.sql
//   npx tsx scripts/apply-sql.ts файл.sql --показать   # только показать, не применять
//
// Зачем это есть. Миграции до сих пор применялись руками через SQL Editor:
// service-role ключ DDL не выполняет, а токена Management API в проекте не было.
// Из-за этого код и база расходились по времени — код выкладывался сразу, база
// ждала, пока до неё дойдут руки, и в промежутке падали шаги, которым не хватало
// колонки. Токен закрывает именно этот разрыв.
//
// Токен нужен персональный (Personal Access Token), из
// https://supabase.com/dashboard/account/tokens — ключи проекта тут не подходят,
// у них нет прав на схему. Положить в .env.local как SUPABASE_ACCESS_TOKEN.
//
// Файл уходит одним запросом целиком, поэтому begin/commit внутри миграции
// работают как задумано: либо применилось всё, либо ничего.
import { config } from 'dotenv'; import path from 'path'; import fs from 'fs'
config({ path: path.resolve(process.cwd(), '.env.local') })

const REF = process.env.SUPABASE_PROJECT_REF
  || (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]

async function main() {
  const файл = process.argv[2]
  const показать = process.argv.includes('--показать')
  if (!файл) {
    console.error('Укажи файл: npx tsx scripts/apply-sql.ts supabase/migrations/…sql')
    process.exit(1)
  }
  if (!fs.existsSync(файл)) { console.error(`Файла нет: ${файл}`); process.exit(1) }

  const sql = fs.readFileSync(файл, 'utf8')
  const строк = sql.split('\n').length
  console.log(`${файл} — ${строк} строк, ${Buffer.byteLength(sql, 'utf8')} байт`)
  if (показать) { console.log(sql); return }

  const токен = process.env.SUPABASE_ACCESS_TOKEN
  if (!токен) {
    console.error(
      'Нет SUPABASE_ACCESS_TOKEN в .env.local.\n'
      + 'Взять на https://supabase.com/dashboard/account/tokens (Personal Access Token)\n'
      + 'и дописать строкой: SUPABASE_ACCESS_TOKEN=sbp_…\n'
      + 'Ключи проекта (anon, service_role) тут не подходят — у них нет прав на схему.',
    )
    process.exit(1)
  }
  if (!REF) { console.error('Не определился ref проекта — задай SUPABASE_PROJECT_REF в .env.local'); process.exit(1) }

  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${токен}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })

  const тело = await res.text()
  if (!res.ok) {
    // Ошибку показываем целиком: у Postgres в ней стоит номер строки, и без него
    // искать место в четырёхсотстрочной миграции приходится глазами.
    console.error(`✗ ${res.status} ${res.statusText}\n${тело}`)
    process.exit(1)
  }

  let данные: unknown = тело
  try { данные = JSON.parse(тело) } catch { /* ответ не json — покажем как есть */ }
  console.log('✓ применено')
  if (Array.isArray(данные) && данные.length) console.log(JSON.stringify(данные, null, 1))
}
main()
