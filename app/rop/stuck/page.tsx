import { createClient, createAdminClient } from '@/lib/supabase/server'
import { StuckDashboard } from './StuckDashboard'
import { readAll } from '@/lib/supabase/read-all'

export default async function StuckPage() {
  const supabase = await createClient()
  const admin = await createAdminClient()
  const [
    { data: salespersons },
    { data: deals },
    { data: stages },
    { data: settings },
  ] = await Promise.all([
    admin.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
    readAll(() => admin.from('deals').select('id, title, stage_id, salesperson_id, budget, updated_at, deleted_at').is('deleted_at', null).order('id')).then(data => ({ data })),
    admin.from('pipeline_stages').select('id, name, position, stage_type').eq('is_active', true).order('position'),
    admin.from('rop_settings').select('key, value'),
  ])
  return (
    <div className="main">
      <div className="topbar"><div className="pt">Застрявшие сделки</div></div>
      <div style={{ padding: '20px 24px' }}>
        <StuckDashboard
          salespersons={salespersons ?? []}
          deals={deals ?? []}
          stages={stages ?? []}
          settings={settings ?? []}
        />
      </div>
    </div>
  )
}
