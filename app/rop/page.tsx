import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RopSidebar } from './RopSidebar'
import { RopDashboard } from './RopDashboard'

export default async function RopPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'rop' && profile?.role !== 'admin') redirect('/sales')

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [
    { data: salespersons },
    { data: salesPlans },
    { data: clients },
    { data: payments },
    { data: deals },
    { data: stages },
    { data: messages },
    { data: tasks },
    { data: settings },
  ] = await Promise.all([
    supabase.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
    supabase.from('sales_plans').select('*').eq('month', currentMonth),
    supabase.from('clients').select('id, salesperson_id, status'),
    supabase.from('payments').select('id, client_id, plan_sum, fact_sum, fact_date, is_paid, status, plan_date'),
    supabase.from('deals').select('id, title, stage_id, salesperson_id, source, budget, is_critical, custom_fields, created_at, updated_at, deleted_at').is('deleted_at', null),
    supabase.from('pipeline_stages').select('id, name, position, stage_type, color, weight').eq('is_active', true).order('position'),
    supabase.from('deal_messages').select('id, deal_id, direction, created_at').order('created_at', { ascending: false }),
    supabase.from('deal_tasks').select('id, deal_id, title, deadline, is_done, assigned_to, task_type').eq('is_done', false),
    supabase.from('rop_settings').select('key, value'),
  ])

  const initials = (profile?.name || user.email || 'РП')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <RopSidebar
        userName={profile?.name || ''}
        userEmail={user.email || ''}
        initials={initials}
        activePage="home"
      />
      <div className="main">
        <div className="topbar">
          <div className="pt">Кабинет РОП</div>
          <div className="tbr">
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{currentMonth}</span>
          </div>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <RopDashboard
            salespersons={salespersons ?? []}
            salesPlans={salesPlans ?? []}
            clients={clients ?? []}
            payments={payments ?? []}
            deals={deals ?? []}
            stages={stages ?? []}
            messages={messages ?? []}
            tasks={tasks ?? []}
            settings={settings ?? []}
            currentMonth={currentMonth}
          />
        </div>
      </div>
    </div>
  )
}
