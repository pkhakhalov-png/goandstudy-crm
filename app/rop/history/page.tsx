import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RopSidebar } from '../RopSidebar'

const actionLabels: Record<string, string> = {
  set_plan: 'Установил план',
  reassign: 'Переназначил сделку',
  create_task: 'Создал задачу',
  mark_critical: 'Отметил критично',
  watch: 'Поставил под контроль',
  update_setting: 'Обновил настройку',
}

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'rop' && profile?.role !== 'admin') redirect('/sales')

  const { data: logs } = await supabase
    .from('rop_actions_log')
    .select('id, rop_id, action_type, deal_id, salesperson_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const { data: allUsers } = await supabase.from('users').select('id, name')
  const { data: deals } = await supabase.from('deals').select('id, title')
  const userMap = Object.fromEntries((allUsers ?? []).map(u => [u.id, u.name]))
  const dealMap = Object.fromEntries((deals ?? []).map(d => [d.id, d.title]))

  const initials = (profile?.name || user.email || 'РП').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <RopSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="history" />
      <div className="main">
        <div className="topbar"><div className="pt">История действий</div></div>
        <div style={{ padding: '20px 24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '6px 8px' }}>Дата</th>
                <th style={{ padding: '6px 8px' }}>Действие</th>
                <th style={{ padding: '6px 8px' }}>Сделка</th>
                <th style={{ padding: '6px 8px' }}>Менеджер</th>
                <th style={{ padding: '6px 8px' }}>Детали</th>
              </tr>
            </thead>
            <tbody>
              {(logs ?? []).map(log => (
                <tr key={log.id} style={{ borderTop: '1px solid var(--bor2)' }}>
                  <td style={{ padding: '10px 8px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {new Date(log.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{actionLabels[log.action_type] || log.action_type}</td>
                  <td style={{ padding: '10px 8px', color: 'var(--purple)' }}>{log.deal_id ? dealMap[log.deal_id] || log.deal_id.slice(0, 8) : '—'}</td>
                  <td style={{ padding: '10px 8px' }}>{log.salesperson_id ? userMap[log.salesperson_id] || '—' : '—'}</td>
                  <td style={{ padding: '10px 8px', fontSize: 10, color: 'var(--muted)' }}>{JSON.stringify(log.metadata).slice(0, 80)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!logs || logs.length === 0) && <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Нет записей</div>}
        </div>
      </div>
    </div>
  )
}
