import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RopSidebar } from '../RopSidebar'
import { ConversionDashboard } from './ConversionDashboard'

export default async function ConversionsPage() {
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
    { data: messages },
    { data: activities },
    { data: settings },
  ] = await Promise.all([
    admin.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
    admin.from('deals').select('id, title, stage_id, salesperson_id, source, budget, created_at, updated_at, closed_at, lost_reason, deleted_at').is('deleted_at', null),
    admin.from('pipeline_stages').select('id, name, position, stage_type, color, weight').eq('is_active', true).order('position'),
    admin.from('deal_messages').select('id, deal_id, direction, created_at'),
    admin.from('deal_activities').select('id, deal_id, activity_type, content, metadata, created_at').eq('activity_type', 'stage_change'),
    admin.from('rop_settings').select('key, value'),
  ])

  const initials = (profile?.name || user.email || 'РП').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <RopSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="conversions" />
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
    </div>
  )
}
