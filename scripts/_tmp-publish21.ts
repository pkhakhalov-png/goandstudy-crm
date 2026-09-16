import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo') as any
async function main() {
  const { data: exists } = await seo.from('jobs').select('id, status').eq('article_id', 21).eq('step', 'article_publish_blog').maybeSingle()
  if (exists) { console.log(`задание на публикацию уже есть: ${exists.status}`); return }
  const { error } = await seo.from('jobs').insert({
    step: 'article_publish_blog', lane: 'production', priority: 5,
    article_id: 21, topic_id: 185,
    payload: { dry_run: false, requested_by: 'owner' },
    status: 'pending', runner: 'agent',
    dedup_key: 'publish:article:21',
  })
  console.log(error ? `✗ ${error.message}` : '✓ публикация поставлена в очередь (runner: agent)')
}
main()
