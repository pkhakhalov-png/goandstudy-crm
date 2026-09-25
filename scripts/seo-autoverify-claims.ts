/**
 * Ручной запуск самостоятельного сбора подтверждений.
 *
 *   npx tsx scripts/seo-autoverify-claims.ts --subject cn          # показать, сколько ждёт
 *   npx tsx scripts/seo-autoverify-claims.ts --subject cn --apply  # собрать
 *   npx tsx scripts/seo-autoverify-claims.ts --apply --limit 40    # все предметы
 *
 * В обычной жизни этого скрипта не нужно: шаг claims_autoverify стоит в
 * часовом расписании и разбирает очередь сам. Скрипт нужен, когда надо закрыть
 * конкретную страну сейчас, не дожидаясь тика.
 *
 * Сама логика живёт в lib/seo/claim-verify.ts — одна реализация на шаг и на
 * скрипт, иначе они разойдутся и «проверено вручную» перестанет значить то же,
 * что «проверено конвейером».
 */
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { autoverifyClaims } from '@/lib/seo/claim-verify'

const seo = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
).schema('seo')

const APPLY = process.argv.includes('--apply')
const arg = (f: string) => (process.argv.includes(`--${f}`) ? process.argv[process.argv.indexOf(`--${f}`) + 1] : null)
const SUBJECT = arg('subject')
const LIMIT = Number(arg('limit') ?? 20)

async function main() {
  let q = seo.from('claims').select('id, subject_key, statement').is('verified_at', null).order('id')
  if (SUBJECT) q = q.eq('subject_key', SUBJECT)
  const { data: waiting } = await q
  console.log(`неподтверждённых утверждений${SUBJECT ? ` по «${SUBJECT}»` : ''}: ${waiting?.length ?? 0}`)
  for (const c of (waiting ?? []).slice(0, LIMIT)) {
    console.log(`  #${(c as any).id} [${(c as any).subject_key}] ${String((c as any).statement).slice(0, 78)}`)
  }
  if (!APPLY) { console.log('\n⚠️ Показ. Запусти с --apply, чтобы система пошла искать источники.'); return }

  console.log('\nищу источники и проверяю…\n')
  const r = await autoverifyClaims(seo, { subject: SUBJECT, limit: LIMIT })
  console.log(`подтверждено: ${r.confirmed}${r.confirmedIds.length ? ` (${r.confirmedIds.map((i) => '#' + i).join(', ')})` : ''}`)
  console.log(`не нашлось:   ${r.notFound}`)
  console.log(`источников заведено: ${r.sourcesAdded}`)
  for (const n of r.notes) console.log(`  · ${n}`)
}
main().catch((e) => { console.error('✗', e?.message ?? e); process.exit(1) })
