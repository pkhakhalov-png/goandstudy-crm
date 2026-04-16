import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RopSidebar } from '../RopSidebar'
import { OverdueTasksDashboard } from './OverdueTasksDashboard'

export default async function TasksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'rop' && profile?.role !== 'admin') redirect('/sales')

  const [
    { data: tasks },
    { data: deals },
    { data: salespersons },
  ] = await Promise.all([
    supabase.from('deal_tasks').select('id, deal_id, title, deadline, is_done, assigned_to, task_type, created_at').eq('is_done', false),
    supabase.from('deals').select('id, title, salesperson_id, deleted_at').is('deleted_at', null),
    supabase.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
  ])

  const initials = (profile?.name || user.email || 'РП').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <RopSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="tasks" />
      <div className="main">
        <div className="topbar"><div className="pt">Задачи</div></div>
        <div style={{ padding: '20px 24px' }}>
          <OverdueTasksDashboard
            tasks={tasks ?? []}
            deals={deals ?? []}
            salespersons={salespersons ?? []}
          />
        </div>
      </div>
    </div>
  )
}
