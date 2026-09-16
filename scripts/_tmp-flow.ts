import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo') as any
async function main() {
  const { data: s } = await seo.from('settings').select('*').in('key', ['flow', 'publish_window', 'next_publish_at'])
  for (const r of s ?? []) console.log(`${r.key}: ${JSON.stringify(r.value)}`)
  const dayAgo = new Date(Date.now() - 24 * 3600e3).toISOString()
  const { data: pub } = await seo.from('articles').select('id, published_at').eq('status', 'published').gte('published_at', dayAgo)
  console.log(`\nопубликовано за сутки: ${pub?.length ?? 0}`, (pub ?? []).map((p: any) => p.published_at?.slice(11, 16)).join(', '))
  const { data: ready } = await seo.from('articles').select('id, status, topic_id').in('status', ['ready_for_review', 'approved'])
  console.log('готовых к публикации:', (ready ?? []).map((r: any) => `${r.id}(тема ${r.topic_id})`).join(', '))
}
main()
