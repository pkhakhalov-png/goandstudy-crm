import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '../../Sidebar'
import { TrashClient } from './TrashClient'

export default async function TrashPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/sales')

  const { data: deals } = await supabase
    .from('deals')
    .select('id, title, contact_name, contact_phone, deleted_at, stage_id')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })

  const { data: stages } = await supabase.from('pipeline_stages').select('id, name, color')

  return (
    <div className="app">
      <Sidebar activePage="funnel" userName={profile?.name || ''} userEmail={user.email || ''} />
      <div className="main">
        <div className="topbar">
          <div className="pt">Корзина</div>
          <a href="/admin/funnel" style={{ fontSize: 12, color: 'var(--purple)', textDecoration: 'none' }}>← Воронка</a>
        </div>
        <TrashClient deals={deals ?? []} stages={stages ?? []} />
      </div>
    </div>
  )
}
