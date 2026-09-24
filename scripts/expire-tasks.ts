import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const сухой = !process.argv.includes('--применить')
async function main() {
  const { count: open } = await sb.from('deal_tasks').select('*', { count: 'exact', head: true }).eq('is_done', false)
  const порог = new Date(Date.now() - 14 * 86400000).toISOString()
  const { count: stale } = await sb.from('deal_tasks').select('*', { count: 'exact', head: true }).eq('is_done', false).lt('deadline', порог)
  console.log(`открытых задач: ${open}, из них просрочено больше 14 дней: ${stale}`)
  if (сухой) { console.log('\nсухой прогон. чтобы закрыть: npx tsx scripts/expire-tasks.ts --применить'); return }
  const { data, error } = await sb.rpc('expire_stale_tasks')
  if (error) { console.error('ошибка:', error.message); process.exit(1) }
  console.log('закрыто как protухших:', data)
  const { count: after } = await sb.from('deal_tasks').select('*', { count: 'exact', head: true }).eq('is_done', false)
  const { count: overdue } = await sb.from('deal_tasks').select('*', { count: 'exact', head: true }).eq('is_done', false).lt('deadline', new Date().toISOString())
  console.log(`осталось открытых: ${after}, из них просрочено: ${overdue}`)
}
main().catch(e => { console.error(e.message); process.exit(1) })
