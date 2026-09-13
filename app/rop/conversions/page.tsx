import { createClient, createAdminClient } from '@/lib/supabase/server'
import { ConversionDashboard } from './ConversionDashboard'
import { readAll } from '@/lib/supabase/read-all'

export default async function ConversionsPage() {
  const supabase = await createClient()
  const admin = await createAdminClient()
  const [
    { data: salespersons },
    { data: deals },
    { data: stages },
    { data: messages },
    { data: activities },
    { data: settings },
  ] = await Promise.all([
    admin.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
    readAll(() => admin.from('deals').select('id, title, stage_id, salesperson_id, source, budget, created_at, updated_at, closed_at, lost_reason, deleted_at').is('deleted_at', null).order('id')).then(data => ({ data })),
    admin.from('pipeline_stages').select('id, name, position, stage_type, color, weight').eq('is_active', true).order('position'),
    // Экрану нужно только число сообщений в сделке — остальные поля не читаем.
    // На двадцати трёх тысячах строк это вчетверо меньше данных по проводу.
    readAll(() => admin.from('deal_messages').select('deal_id').order('id'),
      { label: 'сообщения' }).then(data => ({ data })),
    readAll(() => admin.from('deal_activities').select('id, deal_id, activity_type, content, metadata, created_at').eq('activity_type', 'stage_change').order('id')).then(data => ({ data })),
    admin.from('rop_settings').select('key, value'),
  ])
  return (
    <div className="main">
      <div className="topbar"><div className="pt">Конверсии</div></div>
      <div style={{ padding: '20px 24px' }}>
        <ConversionDashboard
          salespersons={salespersons ?? []}
          deals={deals ?? []}
          stages={stages ?? []}
          messages={messages ?? []}
          activities={activities ?? []}
          settings={settings ?? []}
        />
      </div>
    </div>
  )
}
