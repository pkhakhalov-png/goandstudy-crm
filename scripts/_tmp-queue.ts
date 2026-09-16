import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo') as any
async function main() {
  const { data: jobs } = await seo.from('jobs').select('step, status, topic_id, article_id, priority, next_run_at, created_at')
    .in('status', ['queued', 'running']).order('priority', { ascending: false })
  console.log(`в очереди: ${jobs?.length ?? 0}`)
  for (const j of jobs ?? []) console.log(`  ${j.step.padEnd(22)} ${j.status} prio ${j.priority} тема ${j.topic_id ?? '—'} статья ${j.article_id ?? '—'}`)
  const { data: today } = await seo.from('articles').select('id, status, published_at, current_version_id').gte('created_at', new Date().toISOString().slice(0,10))
  console.log(`\nстатей заведено сегодня: ${today?.length ?? 0}`)
  for (const a of today ?? []) console.log(`  ${a.id} ${a.status} ${a.published_at ?? '—'}`)
}
main()
