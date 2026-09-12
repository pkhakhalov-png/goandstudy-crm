/**
 * Поиск записей в базу, у которых никто не смотрит результат.
 *
 * Это тише и опаснее медленной страницы. Supabase не бросает исключение: при
 * неудаче он возвращает `{ error }`, и если его не прочитать, код спокойно идёт
 * дальше и отчитывается об успехе. В этом проекте так уже терялись данные —
 * вставка падала на ограничении таблицы, а шаг воркера писал «готово».
 *
 *   npx tsx scripts/perf-writes.ts
 *
 * Скрипт ищет `insert` / `update` / `upsert` / `delete` и смотрит, разбирается
 * ли рядом `error`. Он читает текст, а не исполняет код, поэтому возможны
 * промахи в обе стороны — это список для глаз, а не приговор.
 */
import fs from 'fs'
import path from 'path'

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

type Hit = { file: string; line: number; op: string; snippet: string }

function main() {
  const root = process.cwd()
  const unchecked: Hit[] = []
  let total = 0

  for (const file of walk(root)) {
    const rel = path.relative(root, file)
    if (rel.startsWith('scripts/perf-')) continue
    const text = fs.readFileSync(file, 'utf8')
    const lines = text.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/\.(insert|upsert|update|delete)\(/)
      if (!m) continue
      // .update( встречается и у объектов, не только у запросов: отсекаем по
      // признаку цепочки supabase — рядом обязательно есть .from(...)
      const around = lines.slice(Math.max(0, i - 4), i + 1).join('\n')
      if (!/\.from\(/.test(around)) continue
      total++

      // Результат считается разобранным, если поблизости читают error, либо
      // вызов обёрнут в try/await с проверкой, либо результат кому-то присвоен
      const window = lines.slice(Math.max(0, i - 6), Math.min(lines.length, i + 10)).join('\n')
      const checked = /error/.test(window)
        || /throwOnError\(\)/.test(window)
        || /\.then\(/.test(window)
      if (checked) continue

      unchecked.push({
        file: rel, line: i + 1, op: m[1],
        snippet: lines[i].trim().slice(0, 90),
      })
    }
  }

  console.log('\nЗАПИСИ, У КОТОРЫХ НЕ ПРОВЕРЯЕТСЯ РЕЗУЛЬТАТ')
  console.log('─'.repeat(100))
  console.log(`всего записей в коде: ${total} · без проверки: ${unchecked.length}\n`)

  const app = unchecked.filter((h) => !h.file.startsWith('scripts/'))
  const scripts = unchecked.filter((h) => h.file.startsWith('scripts/'))

  if (app.length) {
    console.log('В приложении и библиотеке — это работает у пользователя:')
    for (const h of app) console.log(`   ${h.file}:${h.line}  ${h.op}  ${h.snippet}`)
    console.log()
  } else {
    console.log('В приложении и библиотеке таких нет.\n')
  }

  console.log(`В разовых скриптах: ${scripts.length} (там ошибка видна в терминале сразу)`)
  console.log()
}

main()
