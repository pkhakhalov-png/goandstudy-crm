// Прогон проверки формулировок без чисел по живым статьям (PRD E2.9).
//
// Показывает, что именно нашлось и где: категория, дословная цитата и смещение
// в теле статьи. Смысл прогона — не в количестве, а в том, что каждая находка
// настоящая: ложное срабатывание здесь дороже пропуска.
//
// Запуск:
//   npx tsx scripts/seo-semantic-scan.ts          — вышедшие статьи
//   npx tsx scripts/seo-semantic-scan.ts --all    — все версии, включая черновики
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { findSemanticClaims } from '../lib/seo/semantic-claims'
import { CRITICAL_KINDS } from '../lib/seo/fact-gate'

async function main() {
  const all = process.argv.includes('--all')
  const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .schema('seo')

  type Row = { label: string; body: string }
  const rows: Row[] = []

  if (all) {
    const { data, error } = await seo.from('article_versions')
      .select('id, article_id, version_no, origin, title, body').order('id')
    if (error) { console.error('✗', error.message); process.exit(1) }
    for (const v of data ?? []) {
      rows.push({ label: `версия ${v.id} · статья ${v.article_id} v#${v.version_no} · ${v.origin} · ${String(v.title ?? '').slice(0, 60)}`, body: String(v.body ?? '') })
    }
  } else {
    const { data, error } = await seo.from('articles')
      .select('id, primary_keyword, current_version_id').eq('status', 'published')
      .order('published_at', { ascending: false })
    if (error) { console.error('✗', error.message); process.exit(1) }
    for (const a of data ?? []) {
      const { data: v } = await seo.from('article_versions').select('body').eq('id', a.current_version_id).single()
      rows.push({ label: `#${a.id} «${a.primary_keyword}»`, body: String(v?.body ?? '') })
    }
  }

  let chars = 0, total = 0, blocking = 0
  const byCategory = new Map<string, number>()

  for (const r of rows) {
    if (!r.body) continue
    chars += r.body.length
    const found = findSemanticClaims(r.body)
    if (!found.length) continue

    console.log(`\n${r.label}`)
    for (const f of found) {
      total++
      byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + 1)
      const blocks = CRITICAL_KINDS.has(f.kind)
      if (blocks) blocking++
      console.log(`  [${f.category}] ${blocks ? 'блокирует выпуск' : 'предупреждение'} · «${f.trigger}» · смещение ${f.offset}`)
      console.log(`     ${f.quote}`)
      // Смещение должно указывать ровно на фразу: иначе человек пойдёт искать
      // место в теле статьи и не найдёт его
      const atBody = r.body.slice(f.offset, f.offset + f.trigger.length)
      if (atBody !== f.trigger) console.log(`     ⚠ смещение не совпало с телом: ${JSON.stringify(atBody)}`)
    }
  }

  console.log(`\nпросмотрено ${rows.length} ${all ? 'версий' : 'статей'}, ${chars.toLocaleString('ru')} знаков`)
  console.log(`находок ${total}${total ? ` (блокирующих ${blocking})` : ''}`)
  if (total) console.log('по категориям:', [...byCategory.entries()].map(([k, n]) => `${k}=${n}`).join(', '))
}
main().catch((e) => { console.error('✗', e.message); process.exit(1) })
