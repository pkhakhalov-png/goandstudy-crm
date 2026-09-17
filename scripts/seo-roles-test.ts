// Роли через настройку (E2.7).
//
//   npx tsx scripts/seo-roles-test.ts
//
// Главное, что здесь проверяется, — не то, что настройка работает, а то, что
// её отсутствие ничего не ломает. Действующий конвейер статей настроен и
// работает; появление настройки не имеет права изменить ни одной буквы в том,
// чем пишутся статьи, пока настройку осознанно не изменили.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { resolveRole, allRoles, __resetRoles } from '../lib/seo/model-roles'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')

let passed = 0, failed = 0
function ok(name: string, cond: boolean, note = '') {
  if (cond) { passed++; console.log(`✓ ${name}${note ? ' — ' + note : ''}`) }
  else { failed++; console.log(`✗ ${name}${note ? ' — ' + note : ''}`) }
}

async function main() {
  // 1. Без базы вообще — ровно то, что стояло в коде.
  __resetRoles()
  const offline = await resolveRole(null, 'writer')
  ok('без базы писатель тот же, что был', offline.model === 'claude-opus-5' && offline.provider === 'anthropic',
    `${offline.provider}/${offline.model} (${offline.source})`)

  const has = !(await seo.from('model_roles').select('role').limit(1)).error

  if (!has) {
    // 2. Таблицы нет — работаем как работали.
    __resetRoles()
    const w = await resolveRole(seo, 'writer')
    ok('без таблицы настроек писатель тот же', w.model === 'claude-opus-5', `${w.model} (${w.source})`)
    console.log('\nтаблицы seo.model_roles нет — миграция 20260917090000 не применена.')
    console.log('Файл: docs/sql/роли-моделей.sql. Проверки настройки пойдут после применения.')
    console.log(`\n${passed} пройдено, ${failed} провалено`)
    process.exit(failed ? 1 : 2)
  }

  // 3. Применённая миграция не меняет поведения: в ней те же значения.
  __resetRoles()
  const w = await resolveRole(seo, 'writer')
  ok('после применения миграции писатель не изменился', w.model === 'claude-opus-5' && w.provider === 'anthropic',
    `${w.provider}/${w.model} (${w.source})`)

  const before = await seo.from('model_roles').select('*').eq('role', 'diagrams').single()
  try {
    // 4. Настройка действительно действует.
    await seo.from('model_roles').update({ model: 'claude-haiku-4-5' }).eq('role', 'diagrams').throwOnError()
    __resetRoles()
    const changed = await resolveRole(seo, 'diagrams')
    ok('изменённая настройка доезжает до кода', changed.model === 'claude-haiku-4-5' && changed.source === 'настройка',
      `${changed.model} (${changed.source})`)

    // 5. Выключенная строка не теряется, но и не действует.
    await seo.from('model_roles').update({ enabled: false }).eq('role', 'diagrams').throwOnError()
    __resetRoles()
    const off = await resolveRole(seo, 'diagrams')
    ok('выключенная настройка возвращает значение из кода', off.model === 'claude-opus-5' && off.source === 'по умолчанию',
      `${off.model} (${off.source})`)
  } finally {
    if (before.data) {
      await seo.from('model_roles').update({
        model: before.data.model, enabled: before.data.enabled, prompt_version: before.data.prompt_version,
      }).eq('role', 'diagrams')
      __resetRoles()
      const back = await resolveRole(seo, 'diagrams')
      console.log(`\nвосстановлено: diagrams → ${back.model}, включено ${back.source === 'настройка'}`)
    }
  }

  // 6. Роли без строки в таблице настраиваются окружением — как сегодня.
  const all = await allRoles(seo)
  const emb = all.find((r) => r.role === 'embeddings')!
  ok('встраивания остались на окружении', emb.provider === 'voyage' && ['окружение', 'по умолчанию'].includes(emb.source),
    `${emb.model} (${emb.source})`)

  console.log('\nчем работают роли сейчас:')
  for (const r of all) console.log(`  ${r.role.padEnd(17)} ${r.provider}/${r.model}  ← ${r.source}`)

  console.log(`\n${passed} пройдено, ${failed} провалено`)
  process.exit(failed ? 1 : 0)
}
main()
