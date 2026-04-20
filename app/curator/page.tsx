import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CuratorSidebar } from './CuratorSidebar'
import { CuratorDashboard } from './CuratorDashboard'

export default async function CuratorHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') redirect('/login')

  const admin = await createAdminClient()

  // Find curator record linked to this user
  const { data: curatorRecord } = await admin
    .from('curators')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  const curatorId = curatorRecord?.id

  const [
    { data: clients },
    { data: stages },
    { data: clientStages },
    { data: universities },
    { data: messages },
    { data: tasks },
  ] = await Promise.all([
    admin.from('clients').select('id, name, country, status, curator_id, current_stage_code, created_at').eq('curator_id', curatorId || '').eq('status', 'active'),
    admin.from('curator_stages').select('id, code, title, position, badge').order('position'),
    admin.from('client_stages').select('id, client_id, stage_id, status'),
    admin.from('client_universities').select('id, client_id, university_name, deadline, status'),
    admin.from('client_tg_messages').select('id, client_id, direction, sender_role, created_at').order('created_at', { ascending: false }),
    admin.from('deal_tasks').select('id, deal_id, title, deadline, is_done, assigned_to').eq('is_done', false),
  ])

  const initials = (profile?.name || user.email || 'КР')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <CuratorSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="home" />
      <div className="main">
        <div className="topbar"><div className="pt">Кабинет куратора</div></div>
        <div style={{ padding: '20px 24px' }}>
          <CuratorDashboard
            clients={clients ?? []}
            stages={stages ?? []}
            clientStages={clientStages ?? []}
            universities={universities ?? []}
            messages={messages ?? []}
            tasks={tasks ?? []}
            curatorId={curatorId || null}
          />
        </div>
      </div>
    </div>
  )
}
