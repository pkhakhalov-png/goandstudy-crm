import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RopSidebar } from '../RopSidebar'
import { AnalyticsDashboard } from './AnalyticsDashboard'

export default async function AnalyticsPage() {
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
    { data: activities },
  ] = await Promise.all([
    admin.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
    admin.from('deals').select('id, title, stage_id, salesperson_id, source, lost_reason, created_at, closed_at, deleted_at').is('deleted_at', null),
    admin.from('pipeline_stages').select('id, name, stage_type').eq('is_active', true).order('position'),
    admin.from('deal_activities').select('id, deal_id, activity_type, content, metadata, created_at').eq('activity_type', 'stage_change'),
  ])

  const initials = (profile?.name || user.email || 'РП').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <RopSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="analytics" />
      <div className="main">
        <div className="topbar"><div className="pt">Аналитика</div></div>
        <div style={{ padding: '20px 24px' }}>
          <AnalyticsDashboard
            salespersons={salespersons ?? []}
            deals={deals ?? []}
            stages={stages ?? []}
            activities={activities ?? []}
          />
        </div>
      </div>
    </div>
  )
}
