import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '../../Sidebar'
import { CuratorDetail } from './CuratorDetail'

export default async function CuratorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/sales')

  const admin = await createAdminClient()

  const [
    { data: curator },
    { data: clients },
  ] = await Promise.all([
    admin.from('curators').select('id, name, contact, is_active, user_id, specializations, languages, max_clients, telegram_username, created_at').eq('id', id).single(),
    admin.from('clients').select('id, name, country, status, created_at, curator_id, current_stage_code').eq('curator_id', id).order('created_at', { ascending: false }),
  ])

  if (!curator) redirect('/admin/curators')

  // Get email from linked user
  let email = curator.contact || '—'
  if (curator.user_id) {
    const { data: linkedUser } = await admin.from('users').select('email').eq('id', curator.user_id).single()
    if (linkedUser?.email) email = linkedUser.email
  }

  return (
    <div className="app">
      <Sidebar activePage="curators" userName={profile?.name || ''} userEmail={user.email || ''} />
      <div className="main">
        <div className="topbar"><div className="pt">Куратор: {curator.name}</div></div>
        <div style={{ padding: '20px 24px' }}>
          <CuratorDetail curator={{ ...curator, email }} clients={clients ?? []} />
        </div>
      </div>
    </div>
  )
}
