import { createClient, createAdminClient } from '@/lib/supabase/server'
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

  const dealsPerStage = 50

  const [
    { data: stages },
    { data: salespersons },
    { data: trashedDeals },
    { count: totalDeals },
    { data: curators },
    { data: groupDeals },
  ] = await Promise.all([
    supabase.from('pipeline_stages').select('*').eq('is_active', true).order('position'),
    supabase.from('users').select('id, name').eq('role', 'salesperson').eq('is_active', true).order('name'),
    supabase.from('deals').select('id, contact_name, contact_phone, budget, stage_id, deleted_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(50),
    supabase.from('deals').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    createAdminClient().then(a => a.from('curators').select('id, name').eq('is_active', true).order('name')),
    createAdminClient().then(a => a.from('deals').select('id, title, custom_fields').not('custom_fields->>group_chat_id', 'is', null).is('deleted_at', null)),
  ])

  const availableGroups = (groupDeals ?? []).map(d => ({
    chat_id: d.custom_fields?.group_chat_id || d.custom_fields?.tg_chat_id,
    title: d.custom_fields?.tg_chat_title || d.title,
  })).filter(g => g.chat_id)

  // Parallel: per-stage count + first 50 deals per stage
  const stageList = stages ?? []
  const perStageResults = await Promise.all(
    stageList.flatMap(s => [
      supabase.from('deals').select('*', { count: 'exact', head: true }).eq('stage_id', s.id).is('deleted_at', null),
      supabase
        .from('deals')
        .select('id, title, stage_id, salesperson_id, contact_name, contact_phone, contact_telegram, contact_email, contact_whatsapp, budget, source, created_at, updated_at')
        .eq('stage_id', s.id)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(dealsPerStage),
    ])
  )

  const stageCounts: Record<string, number> = {}
  const deals: any[] = []
  stageList.forEach((s, i) => {
    const countRes = perStageResults[i * 2]
    const dealsRes = perStageResults[i * 2 + 1]
    stageCounts[s.id] = countRes.count ?? 0
    if (dealsRes.data) deals.push(...dealsRes.data)
  })

  return (
    <div className="app">
      <Sidebar activePage="funnel" userName={profile?.name || ''} userEmail={user.email || ''} />
      <div className="main" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="topbar">
          <div className="pt">Воронка</div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{totalDeals ?? deals.length} сделок</span>
        </div>
        <FunnelClient
          stages={stages ?? []}
          deals={deals}
          salespersons={salespersons ?? []}
          isAdmin={true}
          userId={user.id}
          trashedDeals={trashedDeals ?? []}
          stageCounts={stageCounts}
          curators={curators ?? []}
          availableGroups={availableGroups}
        />
      </div>
    </div>
  )
}
