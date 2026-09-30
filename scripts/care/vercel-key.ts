// Переставить ключ модели в переменные превью из .env.local.
//
//   npx tsx scripts/care/vercel-key.ts            # показать, что будет сделано
//   npx tsx scripts/care/vercel-key.ts --apply     # то же, что --применить
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ СКРИПТ. Ту же работу делает одна строка в терминале, но
// строка получается длинной: чтение файла, чистка переносов, конвейер в
// `vercel env add`. Длинная строка переносится в окне ввода, zsh выполняет
// куски по отдельности — и получается «command not found» вместо ключа.
//
// ПОЧЕМУ ЧЕРЕЗ stdin, А НЕ `--value`. Значение в аргументах видно всем, кто
// смотрит список процессов, и остаётся в истории оболочки. Секрет так не
// передают, даже свой собственный и даже один раз.
//
// Сам ключ здесь нигде не печатается — ни в предпросмотре, ни в ошибке.
import { config } from 'dotenv'
import path from 'path'
import fs from 'fs'
import { execFileSync, spawnSync } from 'child_process'

config({ path: path.resolve(process.cwd(), '.env.local') })

const ОБЛАСТЬ = 'pkhakhalov-pngs-projects'
const ВЕТКА = 'feat/curator-v2'
const ИМЯ = 'ANTHROPIC_API_KEY'

function ключИзФайла(): string | null {
  const файл = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(файл)) return null
  for (const строка of fs.readFileSync(файл, 'utf8').split('\n')) {
    if (!строка.startsWith(`${ИМЯ}=`)) continue
    return строка.slice(ИМЯ.length + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return null
}

function main() {
  // Латинский псевдоним не для красоты: кириллический флаг требует
  // переключить раскладку посреди команды, и это ровно та мелочь, из-за
  // которой команду запускают без него по второму разу.
  const применить = ['--применить', '--apply', '--yes'].some((ф) => process.argv.includes(ф))

  const ключ = ключИзФайла()
  if (!ключ) {
    console.error(`В .env.local нет ${ИМЯ} — переставлять нечего.`)
    process.exit(1)
  }

  // Печатаем только длину и хвост: этого хватает, чтобы убедиться, что взят
  // тот ключ, и не хватает, чтобы им воспользоваться.
  console.log(`Ключ из .env.local: ${ключ.length} символов, оканчивается на …${ключ.slice(-4)}`)

  if (!применить) {
    console.log('\nПредпросмотр. С --применить будет сделано:')
    console.log('  (то же самое делает --apply — на случай, если лень переключать раскладку)')
    console.log(`  1. vercel env rm ${ИМЯ} preview ${ВЕТКА}   (если он там есть)`)
    console.log(`  2. vercel env add ${ИМЯ} preview ${ВЕТКА}  — значение через stdin`)
    console.log('\nПосле этого нужен новый деплой превью: переменная подхватится только им.')
    return
  }

  // Снятие может не получиться — например, переменной уже нет. Это не ошибка
  // и останавливать из-за неё нельзя: цель в том, чтобы после нас лежал
  // правильный ключ, а не в том, чтобы каждый шаг отработал.
  try {
    execFileSync(
      'npx',
      ['vercel', 'env', 'rm', ИМЯ, 'preview', ВЕТКА, '--yes', '--scope', ОБЛАСТЬ],
      { stdio: 'pipe' }
    )
    console.log('Прежний ключ снят.')
  } catch {
    console.log('Прежнего ключа не было — сразу ставим новый.')
  }

  const итог = spawnSync(
    'npx',
    ['vercel', 'env', 'add', ИМЯ, 'preview', ВЕТКА, '--yes', '--scope', ОБЛАСТЬ],
    { input: ключ, encoding: 'utf8' }
  )

  const вывод = `${итог.stdout ?? ''}${итог.stderr ?? ''}`
  if (итог.status !== 0) {
    // Вывод Vercel ключа не содержит, но на всякий случай вырезаем его сами:
    // сообщение об ошибке легко уходит в чат целиком.
    console.error(вывод.replaceAll(ключ, '…'))
    process.exit(1)
  }

  console.log('✓ Ключ переставлен.')
  console.log('Теперь нужен новый деплой превью — без него он не подхватится.')
}

main()
