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

  // Сразу выясняем id клиентов этого куратора — чтобы дочерние таблицы
  // (universities, messages) не тянуть глобально.
  const { data: myClients } = await admin
    .from('clients')
    .select('id, name, country, status, curator_id, current_stage_code, created_at')
    .eq('curator_id', curatorId || '')
    .eq('status', 'active')
  const clientIdList = (myClients ?? []).map(c => c.id)

  const [
    { data: stages },
    { data: clientStages },
    { data: universities },
    { data: messages },
  ] = await Promise.all([
    admin.from('curator_stages').select('id, code, title, position, badge').order('position'),
    admin.from('client_stages').select('id, client_id, stage_id, status').in('client_id', clientIdList.length > 0 ? clientIdList : [-1]),
    admin.from('client_universities').select('id, client_id, university_name, deadline, status').in('client_id', clientIdList.length > 0 ? clientIdList : [-1]),
    admin.from('client_tg_messages').select('id, client_id, direction, sender_role, created_at').in('client_id', clientIdList.length > 0 ? clientIdList : [-1]).order('created_at', { ascending: false }),
  ])
  const clients = myClients

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
            curatorId={curatorId || null}
          />
        </div>
      </div>
    </div>
  )
}
