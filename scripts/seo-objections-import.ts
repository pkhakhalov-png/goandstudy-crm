// Темы из возражений клиентов.
//
// Возражение — это готовый запрос человека, который уже думает о покупке.
// «А вдруг не поступлю», «не дадут визу», «дорого» — по этим темам приходят
// не любопытные, а те, кто выбирает. Поэтому приоритет у них высокий, даже
// когда частотность скромная.
//
//   npx tsx scripts/seo-objections-import.ts          разбор
//   npx tsx scripts/seo-objections-import.ts --save   завести темы
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { objectionQueries } from '../lib/seo/audience'
import { loadQueryRows, verdictFor, sameFamily, loadPageTypes } from '../lib/seo/cannibal'

async function main() {
  const SAVE = process.argv.includes('--save')
  const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).schema('seo')

  const rows = await loadQueryRows(seo)
  const types = await loadPageTypes(seo)
  const { data: topics } = await seo.from('topics').select('title, primary_keyword')
  const { data: arts } = await seo.from('articles').select('primary_keyword')
  const taken = [
    ...(topics ?? []).map((t: any) => t.primary_keyword ?? t.title),
    ...(arts ?? []).map((a: any) => a.primary_keyword),
  ].filter(Boolean) as string[]

  let saved = 0
  for (const o of objectionQueries()) {
    console.log(`\n«${o.objection}»`)
    for (const q of o.queries) {
      const twin = taken.find((t) => sameFamily(t, q))
      if (twin) { console.log(`  — «${q}» уже покрыт: «${twin}»`); continue }

      const v = verdictFor(rows, q, undefined, types)
      if (v.verdict === 'risky') { console.log(`  ✗ «${q}» — отобрал бы у своих: ${v.reason.slice(0, 60)}`); continue }
      if (v.verdict === 'update') { console.log(`  ~ «${q}» — обновлять ${v.updateTarget?.replace('https://goandstudy.com', '') ?? 'существующую'}`); continue }

      console.log(`  ✓ «${q}» — ${v.verdict}`)
      if (!SAVE) { taken.push(q); continue }

      const { error } = await seo.from('topics').insert({
        title: q, primary_keyword: q,
        // Высокий приоритет намеренно: человек с возражением ближе к покупке,
        // чем человек с любопытством, даже если запросов у него меньше
        priority: 500, business_value: 90,
        cluster: 'возражения', origin: 'manual', status: 'new',
      })
      if (error) { console.log(`      ✗ не сохранилась: ${error.message.slice(0, 80)}`); continue }
      saved++; taken.push(q)
    }
  }
  console.log(SAVE ? `\nзаведено тем: ${saved}` : '\nэто разбор. Запись: --save')
}
main().catch((e) => { console.error('✗', e.message); process.exit(1) })
