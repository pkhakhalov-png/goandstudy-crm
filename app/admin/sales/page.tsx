import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '../Sidebar'

export default async function AdminSalesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/sales')

  const { data: salespersons } = await supabase
    .from('users')
    .select('id, name, email, is_active')
    .eq('role', 'salesperson')
    .order('name')

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, country, status, salesperson_id, created_at')

  const { data: payments } = await supabase
    .from('payments_view')
    .select('id, client_id, plan_sum, fact_sum, is_paid, status, plan_date')

  const { data: expenses } = await supabase
    .from('expenses')
    .select('id, client_id, plan_sum, fact_sum, is_paid, article')
    .eq('article', 'salesperson')

  const salesStats = (salespersons ?? []).map(s => {
    const myClients = (clients ?? []).filter(c => c.salesperson_id === s.id)
    const myClientIds = myClients.map(c => c.id)
    const myPayments = (payments ?? []).filter(p => myClientIds.includes(p.client_id))
    const myExpenses = (expenses ?? []).filter(e => myClientIds.includes(e.client_id))

    const totalClients = myClients.length
    const activeClients = myClients.filter(c => c.status === 'active').length
    const totalPlan = myPayments.reduce((sum, p) => sum + Number(p.plan_sum), 0)
    const totalPaid = myPayments.filter(p => p.is_paid).reduce((sum, p) => sum + Number(p.fact_sum || p.plan_sum), 0)
    const totalOverdue = myPayments.filter(p => p.status === 'overdue').reduce((sum, p) => sum + Number(p.plan_sum), 0)
    const salaryPlan = myExpenses.reduce((sum, e) => sum + Number(e.plan_sum), 0)
    const salaryPaid = myExpenses.filter(e => e.is_paid).reduce((sum, e) => sum + Number(e.fact_sum || e.plan_sum), 0)
    const pct = totalPlan > 0 ? Math.round(totalPaid / totalPlan * 100) : 0

    return { ...s, totalClients, activeClients, totalPlan, totalPaid, totalOverdue, salaryPlan, salaryPaid, pct }
  })

  const totalClients = (clients ?? []).length
  const totalPlan = (payments ?? []).reduce((s, p) => s + Number(p.plan_sum), 0)
  const totalPaid = (payments ?? []).filter(p => p.is_paid).reduce((s, p) => s + Number(p.fact_sum || p.plan_sum), 0)
  const totalOverdue = (payments ?? []).filter(p => p.status === 'overdue').reduce((s, p) => s + Number(p.plan_sum), 0)

  return (
    <div className="app">
      <Sidebar activePage="sales" userName={profile?.name || ''} userEmail={user.email || ''} />
      <div className="main">
        <div className="topbar">
          <div className="pt">Аналитика продажников</div>
        </div>

        {/* KPI */}
        <div className="kw">
          <div className="kg k4" style={{ marginBottom: 14 }}>
            <div className="kc">
              <div className="kl">Продажников</div>
              <div className="kv p">{salespersons?.length ?? 0}</div>
              <div className="ks">{salespersons?.filter(s => s.is_active).length ?? 0} активных</div>
            </div>
            <div className="kc">
              <div className="kl">Клиентов всего</div>
              <div className="kv">{totalClients}</div>
              <div className="ks">по всем продажникам</div>
            </div>
            <div className="kc">
              <div className="kl">Выручка оплачено</div>
              <div className="kv g" style={{ fontSize: 17 }}>{totalPaid.toLocaleString('ru')} ₽</div>
              <div className="ks">план: {totalPlan.toLocaleString('ru')} ₽</div>
              <div className="kpg"><div className="kpf" style={{ width: `${totalPlan > 0 ? Math.round(totalPaid / totalPlan * 100) : 0}%` }}></div></div>
            </div>
            <div className="kc">
              <div className="kl">Просрочено</div>
              <div className="kv r" style={{ fontSize: 17 }}>{totalOverdue.toLocaleString('ru')} ₽</div>
              <div className="ks">требует внимания</div>
            </div>
          </div>
        </div>

        {/* Таблица */}
        <div className="cnt">
          <div className="ctrl" style={{ marginBottom: 12 }}>
            <div className="sl">По продажникам</div>
          </div>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Продажник</th>
                  <th>Клиентов</th>
                  <th>Активных</th>
                  <th>Договоров (план)</th>
                  <th>Оплачено</th>
                  <th>Просрочено</th>
                  <th>ЗП план</th>
                  <th>ЗП выплачено</th>
                  <th>Прогресс</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {salesStats.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>
                      Продажников пока нет
                    </td>
                  </tr>
                )}
                {salesStats.map(s => (
                  <tr key={s.id} style={{ opacity: s.is_active ? 1 : 0.45 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: 'linear-gradient(135deg,var(--purple),#8b3fa8)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, color: '#fff', fontWeight: 700, flexShrink: 0
                        }}>
                          {(s.name || s.email).split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{s.name || '—'}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className="num">{s.totalClients}</span></td>
                    <td><span className="num p">{s.activeClients}</span></td>
                    <td><span className="num">{s.totalPlan.toLocaleString('ru')} ₽</span></td>
                    <td><span className="num g">{s.totalPaid.toLocaleString('ru')} ₽</span></td>
                    <td>
                      {s.totalOverdue > 0
                        ? <span className="num r">{s.totalOverdue.toLocaleString('ru')} ₽</span>
                        : <span style={{ color: 'var(--muted)' }}>—</span>
                      }
                    </td>
                    <td><span className="num">{s.salaryPlan.toLocaleString('ru')} ₽</span></td>
                    <td>
                      {s.salaryPaid > 0
                        ? <span className="num g">{s.salaryPaid.toLocaleString('ru')} ₽</span>
                        : <span style={{ color: 'var(--muted)' }}>—</span>
                      }
                    </td>
                    <td>
                      <div className="tp">
                        <div className="tpb"><div className="tpf" style={{ width: `${s.pct}%` }}></div></div>
                        <div className="tpp">{s.pct}%</div>
                      </div>
                    </td>
                    <td>
                      {s.is_active
                        ? <span className="pill pa"><span className="dot"></span>Активен</span>
                        : <span className="pill pw"><span className="dot"></span>Неактивен</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}