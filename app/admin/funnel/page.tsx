import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FunnelClient } from './FunnelClient'
import { autoCleanTrash } from './actions'
import { readAll } from '@/lib/supabase/read-all'

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

  // Auto-clean trash older than 7 days
  autoCleanTrash().catch(() => {})

  const dealsPerStage = 50

  const [
    { data: stages },
    { data: salespersons },
    { data: trashedDeals },
    { count: totalDeals },
    { data: curators },
    { data: groupDeals },
    allDeals,
  ] = await Promise.all([
    supabase.from('pipeline_stages').select('*').eq('is_active', true).order('position'),
    supabase.from('users').select('id, name').eq('role', 'salesperson').eq('is_active', true).order('name'),
    supabase.from('deals').select('id, contact_name, contact_phone, budget, stage_id, deleted_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(50),
    supabase.from('deals').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    createAdminClient().then(a => a.from('curators').select('id, name').eq('is_active', true).order('name')),
    createAdminClient().then(a => readAll<any>(() => a
      .from('deals').select('id, title, custom_fields')
      .not('custom_fields->>group_chat_id', 'is', null).is('deleted_at', null)
      .order('id', { ascending: true }), { label: 'сделки с группами' }).then(data => ({ data }))),
    // Сделки читаются один раз и раскладываются по этапам в памяти.
    // Раньше здесь было по два запроса на этап — при четырнадцати этапах экран
    // открывал тридцать пять соединений сразу и ждал самое медленное из них.
    readAll<any>(() => supabase
      .from('deals')
      .select('id, title, stage_id, salesperson_id, contact_name, contact_phone, contact_telegram, contact_email, contact_whatsapp, budget, source, created_at, updated_at')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false }),
      { label: 'сделки' }),
  ])

  const availableGroups = (groupDeals ?? []).map(d => ({
    chat_id: d.custom_fields?.group_chat_id || d.custom_fields?.tg_chat_id,
    title: d.custom_fields?.tg_chat_title || d.title,
  })).filter(g => g.chat_id)

  const stageList = stages ?? []
  const stageCounts: Record<string, number> = {}
  const deals: any[] = []
  for (const s of stageList) {
    // Порядок тот же, что запрашивали у базы: свежие сверху. Второй ключ (id)
    // добавлен, чтобы при одинаковом времени изменения список не прыгал.
    const own = allDeals.filter(d => d.stage_id === s.id)
    stageCounts[s.id] = own.length
    deals.push(...own.slice(0, dealsPerStage))
  }

  return (
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
  )
}
