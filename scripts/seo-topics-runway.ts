// Сколько дней проработает конвейер на имеющихся темах.
//
// Вопрос не праздный: «85 тем» и «37 дней» — разные числа, и разница между
// ними объясняет, почему запас кончается быстрее, чем кажется.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { loadQueryRows, verdictFor, sameFamily, loadPageTypes } from '../lib/seo/cannibal'

async function main() {
  const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).schema('seo')

  const { data: all } = await seo.from('topics').select('id, title, primary_keyword, status')
  const { data: arts } = await seo.from('articles').select('primary_keyword, status')
  const { data: flow } = await seo.from('settings').select('value').eq('key', 'article_flow').maybeSingle()
  const perWeek = (flow?.value as any)?.perWeek ?? 7

  const byStatus: Record<string, number> = {}
  for (const t of all ?? []) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1

  const free = (all ?? []).filter((t: any) => t.status === 'new')
  const rows = await loadQueryRows(seo)
  const types = await loadPageTypes(seo)

  const taken = (arts ?? []).map((a: any) => a.primary_keyword).filter(Boolean) as string[]

  const dropped = { own: 0, risky: 0, update: 0, twin: 0 }
  const safe: string[] = []
  const unclear: string[] = []

  for (const t of free) {
    const q = t.primary_keyword ?? t.title
    if (taken.some((x) => sameFamily(x, q))) { dropped.own++; continue }
    if ([...safe, ...unclear].some((x) => sameFamily(x, q))) { dropped.twin++; continue }

    const v = verdictFor(rows, q, undefined, types)
    if (v.verdict === 'safe') safe.push(q)
    else if (v.verdict === 'unclear') unclear.push(q)
    else if (v.verdict === 'risky') dropped.risky++
    else dropped.update++
  }

  const perDay = perWeek / 7
  const days = (n: number) => Math.floor(n / perDay)

  console.log('ТЕМЫ В БАЗЕ')
  console.log(`  всего записей:            ${all?.length}`)
  for (const [s, n] of Object.entries(byStatus)) console.log(`    ${s.padEnd(20)} ${n}`)
  console.log()
  console.log('ИЗ СВОБОДНЫХ ОТСЕЯНО')
  console.log(`  уже писали о том же:      ${dropped.own}`)
  console.log(`  переформулировка соседней:${dropped.twin}`)
  console.log(`  отобрали бы у своих:      ${dropped.risky}`)
  console.log(`  надо обновлять, не писать:${dropped.update}`)
  console.log()
  console.log('ОСТАЁТСЯ')
  console.log(`  безопасных самостоятельных: ${safe.length}  → ${days(safe.length)} дней`)
  console.log(`  спорных, решает человек:    ${unclear.length}  → ещё ${days(unclear.length)} дней, если одобрите`)
  console.log(`  итого запас:                ${safe.length + unclear.length}  → ${days(safe.length + unclear.length)} дней`)
  console.log()
  console.log(`РИТМ: ${perWeek} статей в неделю = ${perDay.toFixed(2)} в день`)
  console.log(`Расчёт: ${safe.length} + ${unclear.length} = ${safe.length + unclear.length} тем ÷ ${perDay.toFixed(2)} = ${days(safe.length + unclear.length)} дней`)
  console.log()
  console.log('Оговорка: запас тает быстрее числа тем. Каждая написанная статья')
  console.log('занимает свою семью запросов, и соседние формулировки после неё')
  console.log('перестают быть самостоятельными темами.')
}
main().catch((e) => { console.error('✗', e.message); process.exit(1) })
