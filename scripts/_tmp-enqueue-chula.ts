import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo') as any

async function main() {
  const title = 'стоимость обучения в чулалонгкорне'
  const { data: exists } = await seo.from('topics').select('id, status').eq('primary_keyword', title).maybeSingle()

  let topicId = exists?.id
  if (!topicId) {
    const { data, error } = await seo.from('topics').insert({
      title, primary_keyword: title, intent: 'узнать',
      origin: 'manual',
      priority: 95, status: 'new', depth: 0,
    }).select('id').single()
    if (error) throw new Error(`тема: ${error.message}`)
    topicId = data.id
    console.log(`тема заведена: #${topicId}`)
  } else {
    console.log(`тема уже была: #${topicId} (${exists.status})`)
  }

  // Вне очереди: собственное задание, счётчик недельного плана у autostart не трогаем
  const { error } = await seo.from('jobs').insert({
    step: 'article_brief', lane: 'production', priority: 95,
    topic_id: topicId,
    payload: { topic_id: topicId, auto: false, requested_by: 'owner', source_url: 'https://www.chula.ac.th/en/academics/admissions/tuition-and-fees/' },
    dedup_key: `article:topic:${topicId}:manual`,
    status: 'queued', runner: 'any',
  })
  console.log(error ? `задание: ✗ ${error.message}` : 'задание: ✓ поставлено в очередь, приоритет 95')
}
main()
