// Вернуть в очередь упавшие задачи — после того, как причина падения устранена.
//
// Дубли исключены по построению: мы не создаём новую задачу, а возвращаем в
// работу ту же самую (status → pending, счётчик попыток обнуляется). И если по
// той же статье и тому же шагу уже стоит живая задача, эту не трогаем — иначе
// две попытки чинить одну статью дадут две версии и снова подерутся за номер.
//
// Запуск:
//   npx tsx scripts/seo-requeue-failed.ts article_fix --dry
//   npx tsx scripts/seo-requeue-failed.ts article_fix 862
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'

const LIVE = ['pending', 'running', 'waiting']

async function main() {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  const step = args.find((a) => !a.startsWith('-') && !/^\d+$/.test(a))
  const only = args.filter((a) => /^\d+$/.test(a)).map(Number)
  if (!step) { console.error('нужен шаг: npx tsx scripts/seo-requeue-failed.ts article_fix [id…] [--dry]'); process.exit(1) }

  const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .schema('seo')

  const { data: failed, error } = await seo.from('jobs')
    .select('id, step, article_id, attempts, max_attempts, last_error, created_at')
    .eq('step', step).eq('status', 'failed').order('id')
  if (error) { console.error('✗', error.message); process.exit(1) }

  const targets = (failed ?? []).filter((j) => !only.length || only.includes(j.id))
  if (!targets.length) { console.log(`упавших задач ${step} нет${only.length ? ' среди указанных' : ''}`); return }

  const { data: live } = await seo.from('jobs').select('id, article_id').eq('step', step).in('status', LIVE)
  const busy = new Set((live ?? []).map((j) => j.article_id))

  for (const j of targets) {
    if (busy.has(j.article_id)) {
      console.log(`#${j.id} статья ${j.article_id} — уже есть живая задача, пропуск`)
      continue
    }
    console.log(`#${j.id} статья ${j.article_id} · попыток было ${j.attempts}/${j.max_attempts}\n   было: ${j.last_error}`)
    if (dry) continue

    await seo.from('jobs').update({
      status: 'pending', attempts: 0, last_error: null,
      next_run_at: new Date().toISOString(),
      locked_at: null, locked_by: null, lease_expires_at: null,
    }).eq('id', j.id).throwOnError()
    busy.add(j.article_id)   // в один прогон одну статью возвращаем один раз
    console.log('   → возвращена в очередь')
  }
}
main().catch((e) => { console.error('✗', e.message); process.exit(1) })
