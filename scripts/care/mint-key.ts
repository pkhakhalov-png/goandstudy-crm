// Выпуск ключа доступа для кабинета v2.
//
// Что это. JWT, подписанный секретом проекта, с claim role=care_app. PostgREST
// по этому claim переключается на роль Postgres, у которой нет права записи в
// рабочие таблицы. То есть ключ слабее service-role намеренно: им нельзя
// испортить данные кураторов, даже если очень постараться.
//
//   npx tsx scripts/care/mint-key.ts            # показать, куда положить
//   npx tsx scripts/care/mint-key.ts --записать # дописать CARE_DB_KEY в .env.local
//
// Секрет проекта не сохраняется никуда: берётся из Management API на время работы.
import { config } from 'dotenv'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

const REF = process.env.SUPABASE_PROJECT_REF
  || (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')

async function main() {
  const токен = process.env.SUPABASE_ACCESS_TOKEN
  if (!токен || !REF) { console.error('Нужны SUPABASE_ACCESS_TOKEN и ref проекта в .env.local'); process.exit(1) }

  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/postgrest`, {
    headers: { Authorization: `Bearer ${токен}` },
  })
  if (!res.ok) { console.error('Не удалось прочитать настройки проекта:', res.status); process.exit(1) }
  const cfg = await res.json() as { jwt_secret: string; db_schema: string }

  const сейчас = Math.floor(Date.now() / 1000)
  const голова = b64({ alg: 'HS256', typ: 'JWT' })
  const тело = b64({ iss: 'supabase', ref: REF, role: 'care_app', iat: сейчас, exp: сейчас + 60 * 60 * 24 * 3650 })
  const подпись = crypto.createHmac('sha256', cfg.jwt_secret).update(`${голова}.${тело}`).digest('base64url')
  const ключ = `${голова}.${тело}.${подпись}`

  console.log(`Схемы, открытые для API сейчас: ${cfg.db_schema}`)
  console.log(`Схема care ${cfg.db_schema.split(',').includes('care') ? 'открыта' : 'ЕЩЁ НЕ ОТКРЫТА — приложение к ней не достучится'}`)

  if (!process.argv.includes('--записать')) {
    console.log('\nКлюч выпущен. Запусти с --записать, чтобы дописать его в .env.local')
    return
  }

  const файл = path.resolve(process.cwd(), '.env.local')
  const текущий = fs.readFileSync(файл, 'utf8')
  if (текущий.includes('CARE_DB_KEY=')) {
    fs.writeFileSync(файл, текущий.replace(/CARE_DB_KEY=.*/g, `CARE_DB_KEY=${ключ}`))
    console.log('\n✓ CARE_DB_KEY обновлён в .env.local')
  } else {
    fs.appendFileSync(файл, `\n# ── Кабинет куратора v2 ─────────────────────────────────────────────────────\n`
      + `# Ключ роли care_app: запись только в схему care, чтение — перечисленные таблицы public.\n`
      + `# Выпущен scripts/care/mint-key.ts. Отозвать: drop role care_app (откат 001).\n`
      + `CARE_DB_KEY=${ключ}\n`)
    console.log('\n✓ CARE_DB_KEY дописан в .env.local')
  }
}

main()
