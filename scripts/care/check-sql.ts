// Проверка миграции кабинета v2 перед применением к боевой базе.
//
// Зачем. База у нового кабинета боевая, и единственное, что отделяет рабочие
// данные кураторов от случайной правки, — содержание файла миграции. Роль
// care_app защищает приложение, но миграции применяются под postgres, у
// которого прав достаточно на что угодно. Эта проверка — предохранитель
// именно для них.
//
//   npx tsx scripts/care/check-sql.ts supabase/migrations/care/001_care_schema.sql
//
// Возвращает 0, если файл безопасен, и 1 с перечнем нарушений, если нет.
import fs from 'fs'
import path from 'path'

type Нарушение = { строка: number; текст: string; почему: string }

/** Убирает комментарии и строковые литералы: в них слова вроде «drop» безобидны. */
function очистить(sql: string): string[] {
  return sql.split('\n').map((s) => s.replace(/--.*$/, '').replace(/'[^']*'/g, "''"))
}

const ЗАПРЕТЫ: { шаблон: RegExp; почему: string }[] = [
  { шаблон: /\balter\s+table\s+(?:if\s+exists\s+)?(?:public\.|(?!care\.)[a-z_]+\s)/i,
    почему: 'изменение существующей таблицы: кабинет v2 только добавляет своё' },
  { шаблон: /\bdrop\s+(table|view|function|trigger|index|type)\s+(?:if\s+exists\s+)?public\./i,
    почему: 'удаление объекта в public' },
  { шаблон: /\bdrop\s+schema\s+(?:if\s+exists\s+)?(public|seo|content|finance|graphql_public|storage|auth)\b/i,
    почему: 'удаление чужой схемы' },
  { шаблон: /\btruncate\b/i, почему: 'truncate запрещён целиком' },
  { шаблон: /\b(delete\s+from|update)\s+public\./i, почему: 'запись в рабочие таблицы' },
  { шаблон: /\binsert\s+into\s+public\./i, почему: 'запись в рабочие таблицы' },
  { шаблон: /\bcreate\s+(table|view|materialized\s+view)\s+(?:if\s+not\s+exists\s+)?public\./i,
    почему: 'новая таблица должна жить в схеме care' },
  { шаблон: /\b(seo|content|finance)\.\w+/i, почему: 'обращение к чужому контуру' },
  { шаблон: /\bcreate\s+trigger\b[\s\S]{0,200}?\bon\s+public\./i,
    почему: 'триггер на рабочую таблицу — вмешательство в работу действующей CRM' },
  { шаблон: /\bgrant\s+(all|insert|update|delete)\b[^;]*\bon\b[^;]*\bpublic\./i,
    почему: 'роли кабинета нельзя давать запись в public' },
  { шаблон: /\balter\s+role\b|\bcreate\s+role\s+(?!care_app\b)/i,
    почему: 'работа с ролями, кроме создания care_app' },
]

/** create table без схемы — почти всегда промах мимо care. */
const БЕЗ_СХЕМЫ = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?!care\.|public\.)[a-z_][a-z0-9_]*\s*\(/i

/**
 * Политика на рабочую таблицу — допустима, но только одного вида.
 *
 * Зачем это вообще разрешено. Миграция 001 выдала роли `GRANT SELECT` на
 * четырнадцать таблиц, но в боевой базе на них включён RLS, а политик для
 * `care_app` нет. Права есть, строк ноль. Политика — недостающая половина уже
 * принятого решения, а не новое право.
 *
 * Почему с ограничением. `create policy` в остальных видах — это выдача роли
 * возможности писать в рабочие данные в обход всего, ради чего контур
 * затевался. Разрешено ровно `for select to care_app`, остальное — нарушение.
 */
const ПОЛИТИКА_НА_PUBLIC = /\bcreate\s+policy\b[^;]*\bon\s+public\./i
function политикаТолькоНаЧтение(строка: string): boolean {
  return /\bfor\s+select\b/i.test(строка) && /\bto\s+care_app\b/i.test(строка)
}

function проверить(файл: string): Нарушение[] {
  const строки = очистить(fs.readFileSync(файл, 'utf8'))
  const н: Нарушение[] = []
  строки.forEach((строка, i) => {
    for (const з of ЗАПРЕТЫ) {
      if (з.шаблон.test(строка)) н.push({ строка: i + 1, текст: строка.trim().slice(0, 90), почему: з.почему })
    }
    if (БЕЗ_СХЕМЫ.test(строка)) {
      н.push({ строка: i + 1, текст: строка.trim().slice(0, 90), почему: 'таблица без схемы: нужно care.<имя>' })
    }
    if (ПОЛИТИКА_НА_PUBLIC.test(строка) && !политикаТолькоНаЧтение(строка)) {
      н.push({
        строка: i + 1,
        текст: строка.trim().slice(0, 90),
        почему: 'политика на рабочую таблицу разрешена только как «for select to care_app»',
      })
    }
  })
  return н
}

function main() {
  const файл = process.argv[2]
  if (!файл) { console.error('Укажи файл миграции'); process.exit(1) }
  if (!fs.existsSync(файл)) { console.error(`Файла нет: ${файл}`); process.exit(1) }

  const откат = файл.replace(/\.sql$/, '.rollback.sql')
  const проблемы: string[] = []

  const нарушения = проверить(файл)
  for (const н of нарушения) проблемы.push(`строка ${н.строка}: ${н.почему}\n    ${н.текст}`)

  if (!файл.endsWith('.rollback.sql') && !fs.existsSync(откат)) {
    проблемы.push(`нет парного отката: ${path.basename(откат)}`)
  }

  const sql = fs.readFileSync(файл, 'utf8')
  if (!/\bbegin\b/i.test(sql) || !/\bcommit\b/i.test(sql)) {
    проблемы.push('нет begin/commit: миграция должна применяться целиком или никак')
  }

  if (проблемы.length) {
    console.error(`✗ ${файл} — применять нельзя:\n`)
    проблемы.forEach((p) => console.error('  • ' + p))
    process.exit(1)
  }
  console.log(`✓ ${файл} — безопасна: схема care, рабочие таблицы не затронуты`)
}

main()
