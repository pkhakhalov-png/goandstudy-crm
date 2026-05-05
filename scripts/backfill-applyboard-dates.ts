/**
 * Бэкфилл start_date_text и deadline_text для applyboard программ.
 *
 * Источник: raw_data.attributes.earliest_intake.{start_date, submission_deadline}
 *           (формат "2027-09-01")
 * Цель:     start_date_text + deadline_text (читаемый формат "сен 2027")
 *
 * Запускать одноразово. Делает upsert только для строк где start_date_text IS NULL.
 */

import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!,
  process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function fmt(iso: string | undefined | null): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const year = m[1]
  const monthIdx = parseInt(m[2], 10) - 1
  if (monthIdx < 0 || monthIdx > 11) return null
  return `${MONTHS_RU[monthIdx]} ${year}`
}

async function main() {
  const BATCH = 1000
  const PARALLEL = 25
  let processed = 0
  let updated = 0
  let skipped = 0
  let lastId = 0

  console.log('Загружаю applyboard-программы где start_date_text IS NULL…')

  while (true) {
    const { data: chunk, error } = await sb
      .from('programs')
      .select('id, raw_data, start_date_text, deadline_text')
      .eq('source', 'applyboard')
      .is('start_date_text', null)
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(BATCH)
    if (error) { console.error('fetch error:', error); process.exit(1) }
    if (!chunk || chunk.length === 0) break

    const tasks: Promise<void>[] = []
    for (const p of chunk) {
      const ei = (p.raw_data as any)?.attributes?.earliest_intake
      const startStr = fmt(ei?.start_date)
      const deadlineStr = fmt(ei?.submission_deadline)
      if (!startStr && !deadlineStr) {
        skipped++
        continue
      }
      const patch: any = {}
      if (startStr && !p.start_date_text) patch.start_date_text = startStr
      if (deadlineStr && !p.deadline_text) patch.deadline_text = deadlineStr
      if (Object.keys(patch).length === 0) {
        skipped++
        continue
      }
      tasks.push(
        (async () => {
          const r = await sb.from('programs').update(patch).eq('id', p.id)
          if (r.error) console.error(`  id=${p.id} update error:`, r.error.message)
          else updated++
        })(),
      )
      // Throttle parallelism
      if (tasks.length >= PARALLEL) {
        await Promise.all(tasks)
        tasks.length = 0
      }
    }
    if (tasks.length) await Promise.all(tasks)

    processed += chunk.length
    lastId = chunk[chunk.length - 1].id
    console.log(`  processed=${processed} updated=${updated} skipped=${skipped} (lastId=${lastId})`)
  }

  console.log(`\n✅ Done: processed=${processed} updated=${updated} skipped=${skipped}`)
}

main().catch(e => { console.error(e); process.exit(1) })
