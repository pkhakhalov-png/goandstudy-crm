import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo') as any
async function main() {
  const { error } = await seo.from('jobs').update({ status: 'pending', priority: 5, next_run_at: new Date().toISOString() }).eq('topic_id', 185)
  console.log(error ? `✗ ${error.message}` : '✓ задание переведено в pending с приоритетом 5 (самый срочный)')
  const { data } = await seo.from('jobs').select('step, status, priority, next_run_at').eq('topic_id', 185).single()
  console.log(JSON.stringify(data))
}
main()
