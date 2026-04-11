import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '../Sidebar'
import { FunnelClient } from './FunnelClient'

export default async function AdminFunnelPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/sales')

  const [
    { data: stages },
    { data: rawDeals },
    { data: salespersons },
    { data: activities },
  ] = await Promise.all([
    supabase.from('pipeline_stages').select('*').eq('is_active', true).order('position'),
    supabase.from('deals').select('*').order('updated_at', { ascending: false }),
    supabase.from('users').select('id, name').eq('role', 'salesperson').eq('is_active', true).order('name'),
    supabase.from('deal_activities').select('id, deal_id, user_id, activity_type, content, metadata, created_at').order('created_at', { ascending: false }).limit(1000),
  ])

  // Get user names for activities
  const { data: allUsers } = await supabase.from('users').select('id, name')
  const userMap = new Map((allUsers ?? []).map(u => [u.id, u.name]))

  const deals = (rawDeals ?? []).map(d => ({
    ...d,
    activities: (activities ?? [])
      .filter(a => a.deal_id === d.id)
      .map(a => ({ ...a, user_name: userMap.get(a.user_id) ?? 'Система' }))
  }))

  return (
    <div className="app">
      <Sidebar activePage="funnel" userName={profile?.name || ''} userEmail={user.email || ''} />
      <div className="main" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="topbar">
          <div className="pt">Воронка</div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{deals.length} сделок</span>
        </div>
        <FunnelClient
          stages={stages ?? []}
          deals={deals}
          salespersons={salespersons ?? []}
          isAdmin={true}
          userId={user.id}
        />
      </div>
    </div>
  )
}
