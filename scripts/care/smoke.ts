// Дымовой тест после изменения настроек API.
//
//   npx tsx scripts/care/smoke.ts
//
// Отвечает на два вопроса: не сломалась ли действующая CRM и видит ли новый
// кабинет свои таблицы. Только чтение, ничего не меняет.
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CARE = process.env.CARE_DB_KEY!

async function читать(путь: string, ключ: string, схема?: string) {
  const h: Record<string, string> = { apikey: ключ === CARE ? ANON : ключ, Authorization: `Bearer ${ключ}` }
  if (схема) h['Accept-Profile'] = схема
  const r = await fetch(`${URL}/rest/v1/${путь}`, { headers: h })
  return { ок: r.ok, код: r.status, тело: (await r.text()).slice(0, 120) }
}

const проверки = [
  { имя: 'CRM: клиенты (service)', выполнить: () => читать('clients?select=id&limit=1', SERVICE) },
  { имя: 'CRM: платежи (service)', выполнить: () => читать('payments?select=id&limit=1', SERVICE) },
  { имя: 'CRM: очередь SEO (service)', выполнить: () => читать('jobs?select=id&limit=1', SERVICE, 'seo') },
  { имя: 'CRM: контент (service)', выполнить: () => читать('publications?select=id&limit=1', SERVICE, 'content') },
  { имя: 'v2: отпечаток режима (care_app)', выполнить: () => читать('env_marker?select=*', CARE, 'care') },
  { имя: 'v2: чтение клиентов (care_app)', выполнить: () => читать('clients?select=id&limit=1', CARE) },
]

async function main() {
  let плохо = 0
  for (const п of проверки) {
    const р = await п.выполнить()
    if (!р.ок) плохо++
    console.log(`${р.ок ? '✓' : '✗'}  ${п.имя.padEnd(34)} ${р.код}${р.ок ? '' : '  ' + р.тело}`)
  }
  console.log(плохо === 0 ? '\n✓ Все контуры отвечают.' : `\n✗ ${плохо} проверок не прошло.`)
  process.exit(плохо === 0 ? 0 : 1)
}

main()
