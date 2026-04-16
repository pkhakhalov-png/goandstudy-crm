import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RopSidebar } from '../RopSidebar'
import { PipelineDashboard } from './PipelineDashboard'

export default async function PipelinePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'rop' && profile?.role !== 'admin') redirect('/sales')

  const [
    { data: deals },
    { data: stages },
    { data: salespersons },
  ] = await Promise.all([
    supabase.from('deals').select('id, title, stage_id, salesperson_id, budget, deleted_at').is('deleted_at', null),
    supabase.from('pipeline_stages').select('id, name, position, stage_type, color, weight').eq('is_active', true).order('position'),
    supabase.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
  ])

  const initials = (profile?.name || user.email || 'РП').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <RopSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="pipeline" />
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
    </div>
  )
}
