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

  const dealsPerStage = 50

  const [
    { data: stages },
    { data: trashedDeals },
  ] = await Promise.all([
    supabase.from('pipeline_stages').select('*').eq('is_active', true).order('position'),
    supabase.from('deals').select('id, contact_name, contact_phone, budget, stage_id, deleted_at').eq('salesperson_id', user.id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
  ])

  const stageIds = (stages ?? []).map(s => s.id)

  const [dealsResult, countsResult] = await Promise.all([
    supabase
      .from('deals')
      .select('id, title, stage_id, salesperson_id, contact_name, contact_phone, contact_telegram, contact_email, contact_whatsapp, budget, source, created_at, updated_at')
      .eq('salesperson_id', user.id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(dealsPerStage * stageIds.length),
    supabase
      .from('deals')
      .select('stage_id')
      .eq('salesperson_id', user.id)
      .is('deleted_at', null),
  ])

  const rawDeals = dealsResult.data ?? []

  const stageCounts: Record<string, number> = {}
  for (const d of (countsResult.data ?? [])) {
    stageCounts[d.stage_id] = (stageCounts[d.stage_id] || 0) + 1
  }

  const stageDealsCount: Record<string, number> = {}
  const deals = rawDeals.filter(d => {
    stageDealsCount[d.stage_id] = (stageDealsCount[d.stage_id] || 0) + 1
    return stageDealsCount[d.stage_id] <= dealsPerStage
  })

  const totalDeals = Object.values(stageCounts).reduce((s, c) => s + c, 0)

  return (
    <div className="app">
      <SalesSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="funnel" />
      <div className="main" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="topbar">
          <div className="pt">Мои сделки</div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{totalDeals} сделок</span>
        </div>
        <FunnelClient
          stages={stages ?? []}
          deals={deals}
          salespersons={[{ id: user.id, name: profile?.name || '' }]}
          isAdmin={false}
          userId={user.id}
          trashedDeals={trashedDeals ?? []}
          stageCounts={stageCounts}
        />
      </div>
    </div>
  )
}
