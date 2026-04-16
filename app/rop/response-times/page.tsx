import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RopSidebar } from '../RopSidebar'
import { ResponseDashboard } from './ResponseDashboard'

export default async function ResponseTimesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'rop' && profile?.role !== 'admin') redirect('/sales')

  const admin = await createAdminClient()
  const [
    { data: salespersons },
    { data: messages },
    { data: deals },
    { data: stages },
    { data: settings },
  ] = await Promise.all([
    admin.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
    admin.from('deal_messages').select('id, deal_id, direction, created_at').order('created_at'),
    admin.from('deals').select('id, title, salesperson_id, stage_id, updated_at, deleted_at').is('deleted_at', null),
    admin.from('pipeline_stages').select('id, name, stage_type').eq('is_active', true).order('position'),
    admin.from('rop_settings').select('key, value'),
  ])

  const initials = (profile?.name || user.email || 'РП').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <RopSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="response" />
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
    </div>
  )
}
