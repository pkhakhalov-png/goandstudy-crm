// Добыча тем из запросов Search Console.
//   npx tsx scripts/seo-topics-mine.ts           показать кандидатов
//   npx tsx scripts/seo-topics-mine.ts --save    записать в seo.topics
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { loadQueryRows, verdictFor, loadPageTypes } from '../lib/seo/cannibal'
import { mineCandidates } from '../lib/seo/topic-mining'

async function main() {
  const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).schema('seo')
  const SAVE = process.argv.includes('--save')

  const rows = await loadQueryRows(seo, 90)
  const pageTypes = await loadPageTypes(seo)

  const { data: topics } = await seo.from('topics').select('title, primary_keyword')
  const { data: arts } = await seo.from('articles').select('primary_keyword')
  const taken = [
    ...(topics ?? []).map((t: any) => t.primary_keyword ?? t.title),
    ...(arts ?? []).map((a: any) => a.primary_keyword),
  ].filter(Boolean) as string[]

  const candidates = mineCandidates(rows, taken, { limit: 60 })
  console.log(`найдено семей со спросом и слабым ответом: ${candidates.length}\n`)

  let saved = 0
  for (const c of candidates) {
    // Тема не должна отбирать запросы у своих же страниц
    const v = verdictFor(rows, c.query, undefined, pageTypes)
    const mark = v.verdict === 'safe' ? '✓' : v.verdict === 'unclear' ? '?' : '✗'
    if (mark === '✗') continue

    console.log(`${mark} ${c.query}  · ${c.impressions} показов, позиция ${c.position.toFixed(1)}`)
    console.log(`   намерение: ${c.intent} · услуга: ${c.service ?? 'общая'} · ${c.reason}`)
    if (c.family.length > 1) console.log(`   семья: ${c.family.slice(1, 4).join(' · ')}`)

    if (SAVE) {
      const { error } = await seo.from('topics').insert({
        title: c.query, primary_keyword: c.query,
        intent: c.intent, search_volume: c.impressions,
        business_value: c.service, origin: 'gsc_gap', status: 'new',
        priority: Math.round(c.impressions / 10),
      })
      if (!error) saved++
    }
  }
  if (SAVE) console.log(`\nзаписано новых тем: ${saved}`)
  else console.log('\nэто просмотр. Для записи: --save')
}
main().catch((e) => { console.error('✗', e.message); process.exit(1) })
