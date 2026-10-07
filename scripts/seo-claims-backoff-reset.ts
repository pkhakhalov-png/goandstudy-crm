// Сброс отступа у предметов проверки фактов.
//
//   npx tsx scripts/seo-claims-backoff-reset.ts                 # показать карту
//   npx tsx scripts/seo-claims-backoff-reset.ts cn ae --apply   # сбросить названные
//   npx tsx scripts/seo-claims-backoff-reset.ts --all --apply   # сбросить всё
//
// Зачем это нужно. Счётчик неудач растёт и при настоящей неудаче («источника
// не нашлось»), и при посторонней — например, когда на счёте модели кончились
// деньги и запрос вообще не ушёл. Четвёртая неудача означает «больше не
// пробуем вовсе», пути назад в коде нет, и предмет остаётся мёртвым навсегда.
// Пятьдесят три предмета получили этот приговор за дни без оплаты.
//
// Сброс стоит денег: предмет это вызов модели с поиском в сети, по три предмета
// в час. Поэтому по умолчанию скрипт ничего не меняет и просто показывает карту.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')
const КЛЮЧ = 'claims_autoverify_backoff'

type Отступ = { fails: number; nextAt: string }

async function main() {
  const args = process.argv.slice(2)
  const применить = args.includes('--apply')
  const всё = args.includes('--all')
  const предметы = args.filter((a) => !a.startsWith('--'))

  const { data: строка } = await seo.from('settings').select('value').eq('key', КЛЮЧ).maybeSingle()
  const карта: Record<string, Отступ> = (строка?.value ?? {}) as any
  const записи = Object.entries(карта)

  console.log(`предметов в отступе: ${записи.length}`)
  for (const [k, v] of записи.sort((a, b) => b[1].fails - a[1].fails))
    console.log(`  ${k.padEnd(42)} неудач ${v.fails}${v.fails >= 4 ? ' — больше не пробуется' : ''}  следующая попытка ${v.nextAt}`)

  const цели = всё ? записи.map(([k]) => k) : предметы.filter((p) => p in карта)
  const нет = всё ? [] : предметы.filter((p) => !(p in карта))
  if (нет.length) console.log(`\nне в отступе, сбрасывать нечего: ${нет.join(', ')}`)
  if (!цели.length) { console.log('\nнечего сбрасывать'); return }

  console.log(`\nк сбросу (${цели.length}): ${цели.join(', ')}`)
  if (!применить) { console.log('это показ без изменений — добавь --apply'); return }

  for (const c of цели) delete карта[c]
  const { error } = await seo.from('settings').upsert({ key: КЛЮЧ, value: карта }, { onConflict: 'key' })
  if (error) throw new Error(`запись карты: ${error.message}`)
  console.log(`сброшено ${цели.length}; осталось в отступе ${Object.keys(карта).length}`)
}


main().catch((e) => { console.error(e); process.exit(1) })
