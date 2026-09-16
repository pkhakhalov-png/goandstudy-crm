import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo') as any
async function main() {
  const { data: mine } = await seo.from('jobs').select('*').eq('topic_id', 185).single()
  console.log('моё задание:', JSON.stringify({ step: mine.step, status: mine.status, runner: mine.runner, lane: mine.lane, priority: mine.priority, next_run_at: mine.next_run_at, locked_at: mine.locked_at, locked_by: mine.locked_by, attempts: mine.attempts, created_at: mine.created_at }, null, 1))

  const { data: recent } = await seo.from('jobs').select('step, status, created_at, locked_at, result')
    .gte('created_at', new Date(Date.now() - 3600_000).toISOString()).order('created_at', { ascending: false }).limit(10)
  console.log(`\nзадания за час: ${recent?.length ?? 0}`)
  for (const j of recent ?? []) console.log(`  ${new Date(j.created_at).toLocaleTimeString('ru-RU')} ${j.step.padEnd(22)} ${j.status}`)

  const { data: done } = await seo.from('jobs').select('step, status, locked_at').eq('status', 'done')
    .gte('locked_at', new Date(Date.now() - 1800_000).toISOString()).limit(5)
  console.log(`\nвыполнено за полчаса: ${done?.length ?? 0} — значит воркер ${done?.length ? 'жив' : 'молчит'}`)
}
main()
