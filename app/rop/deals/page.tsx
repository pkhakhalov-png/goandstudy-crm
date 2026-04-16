import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RopSidebar } from '../RopSidebar'
import { DealsListView } from './DealsListView'

export default async function DealsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'rop' && profile?.role !== 'admin') redirect('/sales')

  const admin = await createAdminClient()
  const [
    { data: deals },
    { data: stages },
    { data: salespersons },
    { data: messages },
  ] = await Promise.all([
    admin.from('deals').select('id, title, stage_id, salesperson_id, source, budget, is_critical, updated_at, created_at, deleted_at').is('deleted_at', null),
    admin.from('pipeline_stages').select('id, name, position, stage_type, color').eq('is_active', true).order('position'),
    admin.from('users').select('id, name').eq('role', 'salesperson'),
    admin.from('deal_messages').select('id, deal_id, direction, created_at').order('created_at', { ascending: false }),
  ])

  const initials = (profile?.name || user.email || 'РП').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <RopSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="deals" />
      <div className="main">
        <div className="topbar"><div className="pt">Сделки</div></div>
        <div style={{ padding: '20px 24px' }}>
          <DealsListView
            deals={deals ?? []}
            stages={stages ?? []}
            salespersons={salespersons ?? []}
            messages={messages ?? []}
            filters={sp}
          />
        </div>
      </div>
    </div>
  )
}
