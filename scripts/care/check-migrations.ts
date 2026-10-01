// Сверить реестр миграций с тем, что лежит в репозитории.
//
//   npx tsx scripts/care/check-migrations.ts
//
// ЗАЧЕМ. `docs/care/MIGRATIONS.md` — журнал, по которому отвечают на вопрос
// «что в базе». Он ведётся руками и поэтому отстаёт: на двадцать первой
// миграции в нём не хватало четырёх записей, а у двух строк потерялась
// замыкающая черта таблицы — она ломала разметку молча.
//
// Журнал, которому нельзя верить, хуже отсутствующего: на него ссылаются как
// на источник правды. Эта проверка смотрит три вещи:
//
//   · у каждой миграции есть парный откат;
//   · каждая миграция записана в реестр;
//   · контрольная сумма в реестре совпадает с файлом — то есть файл не
//     правили после применения.
import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'

const КАТАЛОГ = path.resolve(process.cwd(), 'supabase/migrations/care')
const РЕЕСТР = path.resolve(process.cwd(), 'docs/care/MIGRATIONS.md')

function сумма(файл: string): string {
  return createHash('sha256').update(fs.readFileSync(файл)).digest('hex').slice(0, 16)
}

function main() {
  const файлы = fs
    .readdirSync(КАТАЛОГ)
    .filter((и) => и.endsWith('.sql') && !и.endsWith('.rollback.sql'))
    .sort()

  const реестр = fs.readFileSync(РЕЕСТР, 'utf8')
  const беды: string[] = []

  for (const файл of файлы) {
    const откат = файл.replace(/\.sql$/, '.rollback.sql')
    if (!fs.existsSync(path.join(КАТАЛОГ, откат))) {
      беды.push(`${файл}: нет парного отката`)
    }

    const строка = реестр.split('\n').find((с) => с.includes(`\`${файл}\``))
    if (!строка) {
      беды.push(`${файл}: не записана в реестр`)
      continue
    }

    // Строка таблицы без замыкающей черты ломает разметку, и реестр
    // перестаёт читаться как таблица — молча.
    if (!строка.trimEnd().endsWith('|')) {
      беды.push(`${файл}: строка реестра без замыкающей «|» — таблица сломана`)
    }

    const вРеестре = строка.match(/`([0-9a-f]{16})`/)?.[1]
    const вФайле = сумма(path.join(КАТАЛОГ, файл))
    if (!вРеестре) {
      беды.push(`${файл}: в реестре нет контрольной суммы`)
    } else if (вРеестре !== вФайле) {
      беды.push(`${файл}: сумма разошлась — в реестре ${вРеестре}, в файле ${вФайле}`)
    }
  }

  console.log(`Миграций в репозитории: ${файлы.length}`)
  if (!беды.length) {
    console.log('✓ Реестр сходится: у всех есть откат, запись и верная сумма.')
    return
  }

  console.error(`\n✗ Расхождений: ${беды.length}`)
  for (const б of беды) console.error(`  · ${б}`)
  process.exit(1)
}

main()
