import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SalesSidebar } from '../SalesSidebar'
import { FunnelClient } from '../../admin/funnel/FunnelClient'

export default async function SalesFunnelPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin/funnel')

  const initials = (profile?.name || user.email || 'ПП')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  const [
    { data: stages },
    { data: rawDeals },
    { data: activities },
  ] = await Promise.all([
    supabase.from('pipeline_stages').select('*').eq('is_active', true).order('position'),
    supabase.from('deals').select('*').eq('salesperson_id', user.id).is('deleted_at', null).order('updated_at', { ascending: false }),
    supabase.from('deal_activities').select('id, deal_id, user_id, activity_type, content, metadata, created_at').order('created_at', { ascending: false }).limit(500),
  ])

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
      <SalesSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="funnel" />
      <div className="main" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="topbar">
          <div className="pt">Мои сделки</div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{deals.length} сделок</span>
        </div>
        <FunnelClient
          stages={stages ?? []}
          deals={deals}
          salespersons={[{ id: user.id, name: profile?.name || '' }]}
          isAdmin={false}
          userId={user.id}
        />
      </div>
    </div>
  )
}
