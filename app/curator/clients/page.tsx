import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CuratorSidebar } from '../CuratorSidebar'
import { CuratorClientsList } from './CuratorClientsList'

export default async function CuratorClientsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') redirect('/login')

  const admin = await createAdminClient()

  const { data: curatorRecord } = await admin.from('curators').select('id').eq('user_id', user.id).maybeSingle()
  const curatorId = curatorRecord?.id

  const [
    { data: clients },
    { data: stages },
    { data: universities },
  ] = await Promise.all([
    admin.from('clients').select('id, name, phone, email, telegram, country, status, curator_id, current_stage_code, created_at, curator_assigned_at').eq('curator_id', curatorId || '').order('created_at', { ascending: false }),
    admin.from('curator_stages').select('id, code, title, position, badge').order('position'),
    admin.from('client_universities').select('id, client_id, deadline, status'),
  ])

  const initials = (profile?.name || user.email || 'КР')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <CuratorSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="clients" />
      <div className="main">
        <div className="topbar">
          <div className="pt">Мои клиенты</div>
          <div className="tbr">
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{(clients ?? []).length} клиентов</span>
          </div>
        </div>
        <CuratorClientsList clients={clients ?? []} stages={stages ?? []} universities={universities ?? []} />
      </div>
    </div>
  )
}
