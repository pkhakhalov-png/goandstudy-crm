// Проверка уже вышедших статей на исполняемую разметку.
//
// Только чтение: ничего не переписывает. Массовая правка живого сайта —
// отдельное решение, а знать состояние нужно уже сейчас.
//
// Запуск: npx tsx scripts/seo-scan-content.ts
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { execFile } from 'child_process'
import { promisify } from 'util'
import { findDangerous } from '../lib/seo/blog-style'

const run = promisify(execFile)
const THEME = '/var/www/html/wordpress/wp-content/themes/goandstudy/inc/blog-articles'

async function main() {
  // Читаем все статьи одной командой: по файлу за раз это сотня подключений
  const { stdout } = await run(
    'ssh',
    ['root@72.56.242.202', `for f in ${THEME}/*.html; do echo "=====$f"; cat "$f"; done`],
    { maxBuffer: 64e6 },
  )

  const parts = stdout.split('=====').filter((p) => p.trim())
  console.log(`статей на сервере: ${parts.length}`)

  let dirty = 0
  for (const part of parts) {
    const nl = part.indexOf('\n')
    const file = part.slice(0, nl).trim()
    const body = part.slice(nl + 1)
    const found = findDangerous(body)
    if (found.length) {
      dirty++
      console.log(`  ⚠ ${path.basename(file)}: ${found.join(', ')}`)
    }
  }

  console.log(dirty
    ? `\n${dirty} статей содержат исполняемую разметку — разбирать поштучно, не скопом`
    : '\n✓ исполняемой разметки нет ни в одной статье')
}

main().catch((e) => { console.error('✗', e.message); process.exit(1) })
