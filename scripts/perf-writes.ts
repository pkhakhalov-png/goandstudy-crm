/**
 * Поиск записей в базу, у которых никто не смотрит результат.
 *
 * Это тише и опаснее медленной страницы. Supabase не бросает исключение: при
 * неудаче он возвращает `{ error }`, и если его не прочитать, код спокойно идёт
 * дальше и отчитывается об успехе. В этом проекте так уже терялись данные —
 * вставка падала на ограничении таблицы, а шаг воркера писал «готово».
 *
 *   npx tsx scripts/perf-writes.ts
 *   npx tsx scripts/perf-writes.ts --all   показать и проверенные тоже
 *
 * КАК ЭТО УСТРОЕНО. Первая версия скрипта искала слово `error` в окне из
 * нескольких строк вокруг записи — и врала в обе стороны: длинная запись на
 * пятнадцать строк выглядела непроверенной, даже когда проверка стояла сразу
 * за ней. Теперь скрипт разбирает саму цепочку вызовов по скобкам: от
 * `.insert(` до конца выражения. Это и есть то место, где проверка обязана
 * быть, — и только оно.
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

/** Индекс сразу за парной закрывающей скобкой. Строки и экранирование учтены. */
function matchParens(text: string, i: number): number {
  let depth = 0
  let quote: string | null = null
  while (i < text.length) {
    const c = text[i]
    if (quote) {
      if (c === '\\') { i += 2; continue }
      if (c === quote) quote = null
    } else if (c === '"' || c === "'" || c === '`') {
      quote = c
    } else if (c === '(') {
      depth++
    } else if (c === ')') {
      if (--depth === 0) return i + 1
    }
    i++
  }
  return -1
}

/** Конец всей цепочки: `.insert(...).eq(...).select()` — до последней скобки. */
function chainEnd(text: string, i: number): number {
  for (;;) {
    let j = i
    while (j < text.length && /\s/.test(text[j])) j++
    if (text[j] !== '.') return i
    const m = /^\.([A-Za-z_$][\w$]*)\s*\(/.exec(text.slice(j))
    if (!m) return i
    const close = matchParens(text, j + m[0].length - 1)
    if (close < 0) return i
    i = close
  }
}

/** Начало выражения: строка с присваиванием или `await` перед цепочкой. */
function statementStart(text: string, i: number): number {
  const from = text.lastIndexOf('\n', i - 1) + 1
  // цепочка может начинаться строкой выше: `const { data } = await admin\n  .from(...)`
  let start = from
  for (let back = 0; back < 4; back++) {
    const prev = text.lastIndexOf('\n', start - 2) + 1
    if (prev <= 0) break
    const line = text.slice(prev, start)
    if (/\.from\(|await\s|=\s*$/.test(line) && !/;\s*$/.test(line.trim())) start = prev
    else break
  }
  return start
}

type Hit = { file: string; line: number; op: string; table: string; snippet: string; checked: string | null }

function main() {
  const showAll = process.argv.includes('--all')
  const root = process.cwd()
  const hits: Hit[] = []

  for (const file of walk(root)) {
    const rel = path.relative(root, file)
    if (rel.startsWith('scripts/perf-')) continue
    const text = fs.readFileSync(file, 'utf8')

    const re = /\.(insert|update|upsert|delete)\s*\(/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      // это должна быть цепочка supabase: где-то рядом слева `.from('таблица')`
      const before = text.slice(Math.max(0, m.index - 400), m.index)
      const tables = [...before.matchAll(/\.from\(['"]([a-zA-Z0-9_]+)['"]\)/g)]
      if (!tables.length) continue

      const callEnd = matchParens(text, m.index + m[0].length - 1)
      if (callEnd < 0) continue
      const end = chainEnd(text, callEnd)
      const stmt = text.slice(statementStart(text, m.index), end)

      // Результат считается прочитанным, если: цепочка сама бросает исключение,
      // если её итог разбирают на `error`, или если он передан обработчику
      let checked: string | null = null
      if (/\.throwOnError\(\)/.test(text.slice(m.index, end + 20))) checked = 'бросает исключение'
      else if (/warnOnError\(/.test(text.slice(callEnd, end + 60))) checked = 'пишет в журнал'
      else if (/\berror\b/.test(stmt)) checked = 'разбирается на error'
      else if (/\.then\(/.test(text.slice(callEnd, end))) checked = 'передан обработчику'
      else {
        // Результат мог быть присвоен переменной, а разобран строкой ниже:
        //   let ins = await seo.from('pages').upsert(...)
        //   if (ins.error) { ... }
        // Это тоже проверка, просто не внутри выражения.
        // Присваивание бывает и объявлением, и переприсваиванием: `let ins = …`
        // и `ins = …` — оба означают, что результат кому-то отдан.
        const assign = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(stmt.split('\n')[0])
          ?? /^\s*([A-Za-z_$][\w$]*)\s*=\s*await/.exec(stmt.split('\n')[0])
        if (assign) {
          const after = text.slice(end, end + 400)
          if (new RegExp(`\\b${assign[1]}\\.error\\b|=\\s*${assign[1]}\\b`).test(after)) {
            checked = 'разбирается ниже по переменной'
          }
        }
      }

      hits.push({
        file: rel,
        line: text.slice(0, m.index).split('\n').length,
        op: m[1],
        table: tables[tables.length - 1][1],
        snippet: text.slice(m.index - 40 < 0 ? 0 : m.index - 40, m.index + 30).replace(/\s+/g, ' ').trim(),
        checked,
      })
    }
  }

  const unchecked = hits.filter((h) => !h.checked)
  const app = unchecked.filter((h) => !h.file.startsWith('scripts/'))
  const scripts = unchecked.filter((h) => h.file.startsWith('scripts/'))

  console.log('\nЗАПИСИ, У КОТОРЫХ НЕ ПРОВЕРЯЕТСЯ РЕЗУЛЬТАТ')
  console.log('─'.repeat(100))
  console.log(`всего записей в коде: ${hits.length} · с проверкой: ${hits.length - unchecked.length} · без: ${unchecked.length}\n`)

  if (app.length) {
    console.log('В приложении и библиотеке — это работает у пользователя:')
    for (const h of app) console.log(`   ${h.file}:${h.line}  ${h.op} в ${h.table}   ${h.snippet}`)
    console.log()
  } else {
    console.log('В приложении и библиотеке таких нет.\n')
  }

  console.log(`В разовых скриптах: ${scripts.length} (там ошибка видна в терминале сразу)`)

  if (showAll) {
    const by: Record<string, number> = {}
    for (const h of hits) by[h.checked ?? 'без проверки'] = (by[h.checked ?? 'без проверки'] ?? 0) + 1
    console.log('\nКАК ИМЕННО ПРОВЕРЯЮТСЯ')
    console.log('─'.repeat(100))
    for (const [k, n] of Object.entries(by).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k.padEnd(28)} ${String(n).padStart(4)}`)
    }
  }
  console.log()
}

main()
