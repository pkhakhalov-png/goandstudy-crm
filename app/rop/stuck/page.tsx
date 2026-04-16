import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RopSidebar } from '../RopSidebar'
import { StuckDashboard } from './StuckDashboard'

export default async function StuckPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'rop' && profile?.role !== 'admin') redirect('/sales')

  const admin = await createAdminClient()
  const [
    { data: salespersons },
    { data: deals },
    { data: stages },
    { data: settings },
  ] = await Promise.all([
    admin.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
    admin.from('deals').select('id, title, stage_id, salesperson_id, budget, updated_at, deleted_at').is('deleted_at', null),
    admin.from('pipeline_stages').select('id, name, position, stage_type').eq('is_active', true).order('position'),
    admin.from('rop_settings').select('key, value'),
  ])

  const initials = (profile?.name || user.email || 'РП').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <RopSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="stuck" />
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
    </div>
  )
}
