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
    { data: salespersons },
    { data: trashedDeals },
  ] = await Promise.all([
    supabase.from('pipeline_stages').select('*').eq('is_active', true).order('position'),
    supabase.from('users').select('id, name').eq('role', 'salesperson').eq('is_active', true).order('name'),
    supabase.from('deals').select('id, contact_name, contact_phone, budget, stage_id, deleted_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
  ])

  // Load first 50 deals per stage + total counts
  const stageIds = (stages ?? []).map(s => s.id)
  const dealsPerStage = 50

  const [dealsResult, countsResult] = await Promise.all([
    // First batch of deals (limited)
    supabase
      .from('deals')
      .select('id, title, stage_id, salesperson_id, contact_name, contact_phone, contact_telegram, contact_email, contact_whatsapp, budget, source, created_at, updated_at')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(dealsPerStage * stageIds.length),
    // Total counts per stage
    supabase
      .from('deals')
      .select('stage_id')
      .is('deleted_at', null),
  ])

  const rawDeals = dealsResult.data ?? []

  // Count per stage
  const stageCounts: Record<string, number> = {}
  for (const d of (countsResult.data ?? [])) {
    stageCounts[d.stage_id] = (stageCounts[d.stage_id] || 0) + 1
  }

  // Limit per stage to dealsPerStage
  const stageDealsCount: Record<string, number> = {}
  const deals = rawDeals.filter(d => {
    stageDealsCount[d.stage_id] = (stageDealsCount[d.stage_id] || 0) + 1
    return stageDealsCount[d.stage_id] <= dealsPerStage
  })

  const totalDeals = Object.values(stageCounts).reduce((s, c) => s + c, 0)

  return (
    <div className="app">
      <Sidebar activePage="funnel" userName={profile?.name || ''} userEmail={user.email || ''} />
      <div className="main" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="topbar">
          <div className="pt">Воронка</div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{totalDeals} сделок</span>
        </div>
        <FunnelClient
          stages={stages ?? []}
          deals={deals}
          salespersons={salespersons ?? []}
          isAdmin={true}
          userId={user.id}
          trashedDeals={trashedDeals ?? []}
          stageCounts={stageCounts}
        />
      </div>
    </div>
  )
}
