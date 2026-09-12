// Сколько открывались экраны РОПа, пока читали обрезанную выдачу.
// Нужно для честной таблицы «было → стало»: сравнивать с числом, которого не
// измеряли, нельзя. Здесь воспроизведены те самые запросы, какими они были.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function time(label: string, fn: () => Promise<any>, runs = 3) {
  const ts: number[] = []
  for (let i = 0; i < runs; i++) { const t0 = performance.now(); await fn(); ts.push(performance.now() - t0) }
  ts.sort((a, b) => a - b)
  console.log(`${label.padEnd(24)} ${String(Math.round(ts[0])).padStart(5)} мс`)
}

async function main() {
  console.log('\nЭКРАНЫ РОПА — КАК БЫЛО (обычный select, выдача обрезалась на тысяче)')
  console.log('─'.repeat(60))
  await time('/rop', async () => {
    await sb.from('users').select('name, role').limit(1)
    await Promise.all([
      sb.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
      sb.from('sales_plans').select('*'),
      sb.from('clients').select('id, name, salesperson_id, status'),
      sb.from('deals').select('id, title, stage_id, salesperson_id, source, budget, is_critical, custom_fields, created_at, updated_at, deleted_at').is('deleted_at', null),
      sb.from('pipeline_stages').select('id, name, position, stage_type, color, weight').eq('is_active', true).order('position'),
      sb.from('deal_messages').select('id, deal_id, direction, created_at').order('created_at', { ascending: false }),
      sb.from('deal_tasks').select('id, deal_id, title, deadline, is_done, assigned_to, task_type').eq('is_done', false),
      sb.from('rop_settings').select('key, value'),
    ])
  })
  await time('/rop/analytics', async () => {
    await sb.from('users').select('name, role').limit(1)
    await Promise.all([
      sb.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
      sb.from('deals').select('id, title, stage_id, salesperson_id, source, lost_reason, created_at, closed_at, deleted_at').is('deleted_at', null),
      sb.from('pipeline_stages').select('id, name, stage_type').eq('is_active', true).order('position'),
      sb.from('deal_activities').select('id, deal_id, activity_type, content, metadata, created_at').eq('activity_type', 'stage_change'),
    ])
  })
  await time('/rop/response-times', async () => {
    await sb.from('users').select('name, role').limit(1)
    await Promise.all([
      sb.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
      sb.from('deal_messages').select('id, deal_id, direction, created_at').order('created_at'),
      sb.from('deals').select('id, title, salesperson_id, stage_id, updated_at, deleted_at').is('deleted_at', null),
      sb.from('pipeline_stages').select('id, name, stage_type').eq('is_active', true).order('position'),
      sb.from('rop_settings').select('key, value'),
    ])
  })
  await time('/rop/conversions', async () => {
    await sb.from('users').select('name, role').limit(1)
    await Promise.all([
      sb.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
      sb.from('deals').select('id, title, stage_id, salesperson_id, source, budget, created_at, updated_at, closed_at, lost_reason, deleted_at').is('deleted_at', null),
      sb.from('pipeline_stages').select('id, name, stage_type, position').eq('is_active', true).order('position'),
      sb.from('deal_messages').select('id, deal_id, direction, created_at'),
      sb.from('deal_activities').select('id, deal_id, activity_type, content, metadata, created_at').eq('activity_type', 'stage_change'),
    ])
  })
  console.log('\nэто время неполных данных: каждая из больших выборок отдавала тысячу строк\n')
}
main().catch((e) => { console.error('✗', e.message); process.exit(1) })
