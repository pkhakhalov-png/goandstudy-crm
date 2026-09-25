// Применить миграцию кабинета v2 к базе — только после проверки безопасности.
//
//   npx tsx scripts/care/apply.ts supabase/migrations/care/001_care_schema.sql
//   npx tsx scripts/care/apply.ts … --показать     # показать SQL, не применять
//
// Отдельный скрипт, а не правка scripts/apply-sql.ts: общий инструмент трогать
// незачем, а здесь нужна обязательная проверка перед каждым запуском.
import { config } from 'dotenv'
import path from 'path'
import fs from 'fs'
import { execFileSync } from 'child_process'
config({ path: path.resolve(process.cwd(), '.env.local') })

const REF = process.env.SUPABASE_PROJECT_REF
  || (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]

async function main() {
  const файл = process.argv[2]
  const показать = process.argv.includes('--показать')
  if (!файл || !fs.existsSync(файл)) { console.error('Укажи существующий файл миграции'); process.exit(1) }

  // Проверка обязательна и непропускаема: ключа «пропустить» намеренно нет.
  try {
    execFileSync('npx', ['tsx', 'scripts/care/check-sql.ts', файл], { stdio: 'inherit' })
  } catch {
    console.error('\n✗ Миграция не прошла проверку — ничего не применялось.')
    process.exit(1)
  }

  const sql = fs.readFileSync(файл, 'utf8')
  if (показать) { console.log(sql); return }

  const токен = process.env.SUPABASE_ACCESS_TOKEN
  if (!токен) { console.error('Нет SUPABASE_ACCESS_TOKEN в .env.local'); process.exit(1) }
  if (!REF) { console.error('Не определился ref проекта'); process.exit(1) }

  console.log(`\nПрименяю к ${REF} — ${sql.split('\n').length} строк`)
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${токен}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const тело = await res.text()
  if (!res.ok) { console.error(`✗ ${res.status} ${res.statusText}\n${тело}`); process.exit(1) }
  console.log('✓ применено')
}

main()
