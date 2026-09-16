import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo') as any
async function main() {
  const { data: jobs } = await seo.from('jobs')
    .select('step, status, priority, attempts, article_id, topic_id, last_error, result, created_at, locked_at')
    .eq('topic_id', 185).order('created_at')
  console.log(`заданий по теме 185: ${jobs?.length ?? 0}`)
  for (const j of jobs ?? []) {
    console.log(`  ${j.step.padEnd(20)} ${j.status.padEnd(9)} попыток ${j.attempts} ${j.article_id ? `статья ${j.article_id}` : ''}`)
    if (j.last_error) console.log(`      ошибка: ${String(j.last_error).slice(0, 200)}`)
    if (j.result) console.log(`      итог: ${JSON.stringify(j.result).slice(0, 220)}`)
  }
  const { data: art } = await seo.from('articles').select('id, status, created_at, current_version_id').eq('topic_id', 185).maybeSingle()
  if (art) {
    const { data: v } = await seo.from('article_versions').select('title, origin, version_no, meta').eq('id', art.current_version_id).maybeSingle()
    console.log(`\nстатья ${art.id}: ${art.status} · версия ${v?.version_no} (${v?.origin}) · «${v?.title ?? '—'}»`)
    const m: any = v?.meta ?? {}
    if (m.cover) console.log(`обложка: ${m.cover.bytes} байт${m.cover.placeholder ? ' — ЗАГЛУШКА' : ''}`)
  }
}
main()
