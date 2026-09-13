import { createClient, createAdminClient } from '@/lib/supabase/server'
import { PipelineDashboard } from './PipelineDashboard'
import { readAll } from '@/lib/supabase/read-all'

export default async function PipelinePage() {
  const supabase = await createClient()
  const admin = await createAdminClient()
  const [
    { data: deals },
    { data: stages },
    { data: salespersons },
  ] = await Promise.all([
    readAll(() => admin.from('deals').select('id, title, stage_id, salesperson_id, budget, deleted_at').is('deleted_at', null).order('id')).then(data => ({ data })),
    admin.from('pipeline_stages').select('id, name, position, stage_type, color, weight').eq('is_active', true).order('position'),
    admin.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
  ])
  return (
    <div className="main">
      <div className="topbar"><div className="pt">Pipeline</div></div>
      <div style={{ padding: '20px 24px' }}>
        <PipelineDashboard
          deals={deals ?? []}
          stages={stages ?? []}
          salespersons={salespersons ?? []}
        />
      </div>
    </div>
  )
}
