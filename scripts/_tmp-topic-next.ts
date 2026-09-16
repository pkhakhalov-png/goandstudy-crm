import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo') as any
async function main() {
  const kw = 'университеты в кино'
  const { data: exists } = await seo.from('topics').select('id, status').eq('primary_keyword', kw).maybeSingle()
  if (exists) { console.log(`тема уже есть: #${exists.id} (${exists.status})`); return }
  // У тем приоритет по убыванию: чем больше число, тем раньше её возьмёт
  // автозапуск. 60 — выше обычных 20–25 из поисковых пробелов, но не срочно.
  const { data, error } = await seo.from('topics').insert({
    title: kw, primary_keyword: kw, intent: 'узнать',
    origin: 'manual', priority: 60, status: 'new', depth: 0,
  }).select('id').single()
  console.log(error ? `✗ ${error.message}` : `✓ тема #${data.id} «${kw}» — возьмут следующей, без внеочередного задания`)
}
main()
