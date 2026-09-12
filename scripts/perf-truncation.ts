/**
 * Поиск мест, где выдача может молча обрезаться на тысяче строк.
 *
 * Это опаснее медленной страницы. Медленную видно, а обрезанную — нет: экран
 * показывает цифры, они выглядят правдоподобно, и никто не узнает, что треть
 * данных не доехала. Такое здесь уже случалось: воронка читала сделки обычным
 * select и показывала тысячу из 1046.
 *
 * Скрипт берёт каждый `select` в коде, смотрит, ограничен ли он явно, и
 * сверяет с настоящим размером таблицы. Там, где таблица мала и расти не будет,
 * обрезка невозможна — такие места отмечены и в глаза не лезут.
 *
 *   npx tsx scripts/perf-truncation.ts           только опасные места
 *   npx tsx scripts/perf-truncation.ts --all     вообще все найденные выборки
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Таблицы, которые растут со временем: для них обрезка — вопрос времени. */
const GROWING = new Set([
  'deals', 'gsc_daily', 'gsc_page_daily', 'jobs', 'payments', 'expenses', 'clients',
  'bookings', 'invoices', 'article_versions', 'articles', 'topics', 'findings',
  'opportunities', 'pages', 'index_status', 'lead_identities', 'claims', 'claim_sources',
  'page_schema', 'experiments', 'production_runs', 'production_run_items', 'events',
])

const SKIP_DIRS = ['node_modules', '.next', '.git', 'dist']

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.includes(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full)
  }
  return out
}

type Site = {
  file: string
  line: number
  table: string
  schema: 'public' | 'seo'
  guard: string | null
  snippet: string
}

/**
 * Кусок кода одного запроса: от `.from(` до конца цепочки. Цепочка кончается
 * там, где строка перестаёт быть её продолжением — то есть на пустой строке,
 * на начале следующего запроса или на закрытии списка.
 */
function chainAt(text: string, from: number): string {
  const rest = text.slice(from, from + 900)
  const lines = rest.split('\n')
  const out: string[] = [lines[0]]
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i]
    if (!l.trim()) break
    if (/\.from\(/.test(l)) break
    // продолжение цепочки — либо `.method(`, либо продолжение аргументов
    if (/^\s*[.)\]]/.test(l) || /^\s*\w+:/.test(l) || /^\s*'/.test(l)) { out.push(l); continue }
    break
  }
  return out.join('\n')
}

function guardOf(chain: string): string | null {
  if (/head:\s*true/.test(chain)) return 'счёт без строк'
  if (/\.single\(\)|\.maybeSingle\(\)/.test(chain)) return 'одна строка'
  if (/\.range\(/.test(chain)) return 'постранично'
  if (/\.limit\(/.test(chain)) return 'явный предел'
  if (/readAll\(/.test(chain)) return 'читается целиком'
  // операции записи не выбирают строки
  if (/\.(insert|upsert|update|delete)\(/.test(chain) && !/\.select\(/.test(chain)) return 'запись'
  return null
}

async function main() {
  const showAll = process.argv.includes('--all')
  const root = process.cwd()
  const files = walk(root)

  const sites: Site[] = []
  for (const file of files) {
    const rel = path.relative(root, file)
    if (rel.startsWith('scripts/perf-')) continue
    const text = fs.readFileSync(file, 'utf8')
    const isSeo = /schema\('seo'\)/.test(text)

    const re = /\.from\(['"]([a-zA-Z0-9_]+)['"]\)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      const chain = chainAt(text, m.index)
      // readAll оборачивает запрос снаружи — заглядываем на строку выше
      const before = text.slice(Math.max(0, m.index - 200), m.index)
      const guard = guardOf(chain) ?? (/readAll[\s\S]{0,160}$/.test(before) ? 'читается целиком' : null)
      sites.push({
        file: rel,
        line: text.slice(0, m.index).split('\n').length,
        table: m[1],
        schema: isSeo ? 'seo' : 'public',
        guard,
        snippet: chain.split('\n')[0].trim().slice(0, 80),
      })
    }
  }

  // Размеры таблиц — по одному запросу на таблицу, а не на место в коде
  const tables = [...new Set(sites.map((s) => `${s.schema}.${s.table}`))]
  const sizes = new Map<string, number | null>()
  await Promise.all(tables.map(async (t) => {
    const [schema, name] = t.split('.')
    const client: any = schema === 'seo' ? sb.schema('seo') : sb
    const { count, error } = await client.from(name).select('*', { count: 'exact', head: true })
    sizes.set(t, error ? null : (count ?? 0))
  }))

  const risky: Site[] = []
  const safeSmall: Site[] = []
  const guarded: Site[] = []

  for (const s of sites) {
    const size = sizes.get(`${s.schema}.${s.table}`)
    if (s.guard) { guarded.push(s); continue }
    if (size === null || size === undefined) { safeSmall.push(s); continue }  // таблицы нет — скорее всего это чужой .from()
    const grows = GROWING.has(s.table)
    if (size >= 800 || (grows && size >= 200)) risky.push(s)
    else safeSmall.push(s)
  }

  console.log('\nГДЕ ВЫДАЧА МОЖЕТ ОБРЕЗАТЬСЯ МОЛЧА')
  console.log('─'.repeat(100))
  console.log(`всего выборок в коде: ${sites.length} · с явным ограничением: ${guarded.length}`
    + ` · по малым таблицам: ${safeSmall.length} · требуют внимания: ${risky.length}\n`)

  if (risky.length) {
    const byTable = new Map<string, Site[]>()
    for (const s of risky) {
      const k = `${s.schema}.${s.table}`
      ;(byTable.get(k) ?? byTable.set(k, []).get(k)!).push(s)
    }
    for (const [t, list] of [...byTable.entries()].sort((a, b) => (sizes.get(b[0]) ?? 0) - (sizes.get(a[0]) ?? 0))) {
      console.log(`${t} — сейчас ${(sizes.get(t) ?? 0).toLocaleString('ru')} строк`)
      for (const s of list) console.log(`   ${s.file}:${s.line}  ${s.snippet}`)
      console.log()
    }
  } else {
    console.log('опасных мест не найдено\n')
  }

  console.log('РАЗМЕРЫ ТАБЛИЦ')
  console.log('─'.repeat(100))
  for (const [t, n] of [...sizes.entries()].sort((a, b) => (b[1] ?? -1) - (a[1] ?? -1))) {
    if (n === null) continue
    const mark = n >= 1000 ? '  ← больше тысячи' : n >= 500 ? '  ← подходит к тысяче' : ''
    console.log(`  ${t.padEnd(30)} ${String(n).padStart(8)}${mark}`)
  }

  if (showAll) {
    console.log('\nВСЕ НАЙДЕННЫЕ ВЫБОРКИ')
    console.log('─'.repeat(100))
    for (const s of sites) {
      console.log(`  ${(s.guard ?? 'без ограничения').padEnd(18)} ${s.schema}.${s.table.padEnd(22)} ${s.file}:${s.line}`)
    }
  }
  console.log()
}

main().catch((e) => { console.error('✗', e?.message ?? e); process.exit(1) })
