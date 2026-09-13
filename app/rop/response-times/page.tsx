import { createClient, createAdminClient } from '@/lib/supabase/server'
import { ResponseDashboard } from './ResponseDashboard'
import { readAll } from '@/lib/supabase/read-all'

export default async function ResponseTimesPage() {
  const supabase = await createClient()
  const admin = await createAdminClient()
  const [
    { data: salespersons },
    { data: messages },
    { data: deals },
    { data: stages },
    { data: settings },
  ] = await Promise.all([
    admin.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
    readAll(() => admin.from('deal_messages').select('id, deal_id, direction, created_at').order('created_at').order('id')).then(data => ({ data })),
    readAll(() => admin.from('deals').select('id, title, salesperson_id, stage_id, updated_at, deleted_at').is('deleted_at', null).order('id')).then(data => ({ data })),
    admin.from('pipeline_stages').select('id, name, stage_type').eq('is_active', true).order('position'),
    admin.from('rop_settings').select('key, value'),
  ])
  return (
    <div className="main">
      <div className="topbar"><div className="pt">Время ответа</div></div>
      <div style={{ padding: '20px 24px' }}>
        <ResponseDashboard
          salespersons={salespersons ?? []}
          messages={messages ?? []}
          deals={deals ?? []}
          stages={stages ?? []}
          settings={settings ?? []}
        />
      </div>
    </div>
  )
}
