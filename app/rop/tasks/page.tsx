import { createClient, createAdminClient } from '@/lib/supabase/server'
import { OverdueTasksDashboard } from './OverdueTasksDashboard'
import { readAll } from '@/lib/supabase/read-all'

export default async function TasksPage() {
  const supabase = await createClient()
  const admin = await createAdminClient()
  const [
    { data: tasks },
    { data: deals },
    { data: salespersons },
  ] = await Promise.all([
    readAll(() => admin.from('deal_tasks').select('id, deal_id, title, deadline, is_done, assigned_to, task_type, created_at').eq('is_done', false).order('id')).then(data => ({ data })),
    readAll(() => admin.from('deals').select('id, title, salesperson_id, deleted_at').is('deleted_at', null).order('id')).then(data => ({ data })),
    admin.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
  ])
  return (
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
  )
}
