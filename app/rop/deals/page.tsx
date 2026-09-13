import { createClient, createAdminClient } from '@/lib/supabase/server'
import { DealsListView } from './DealsListView'
import { readAll } from '@/lib/supabase/read-all'

export default async function DealsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const admin = await createAdminClient()
  const [
    { data: deals },
    { data: stages },
    { data: salespersons },
    { data: messages },
  ] = await Promise.all([
    readAll(() => admin.from('deals').select('id, title, stage_id, salesperson_id, source, budget, is_critical, updated_at, created_at, deleted_at').is('deleted_at', null).order('id')).then(data => ({ data })),
    admin.from('pipeline_stages').select('id, name, position, stage_type, color').eq('is_active', true).order('position'),
    admin.from('users').select('id, name').eq('role', 'salesperson'),
    readAll(() => admin.from('deal_messages').select('id, deal_id, direction, created_at').order('created_at', { ascending: false }).order('id')).then(data => ({ data })),
  ])
  return (
    <div className="main">
      <div className="topbar"><div className="pt">Сделки</div></div>
      <div style={{ padding: '20px 24px' }}>
        <DealsListView
          deals={deals ?? []}
          stages={stages ?? []}
          salespersons={salespersons ?? []}
          messages={messages ?? []}
          filters={sp}
        />
      </div>
    </div>
  )
}
