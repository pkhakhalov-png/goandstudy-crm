import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '../Sidebar'

export default async function AdminSalesPage({
  searchParams,
}: {
  searchParams: { month?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/sales')

  // Определяем период
  const now = new Date()
  const monthParam = searchParams.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [year, month] = monthParam.split('-').map(Number)
  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
  const periodEnd = new Date(year, month, 0).toISOString().split('T')[0]

  const PLAN = 900000

  const { data: salespersons } = await supabase
    .from('users')
    .select('id, name, email, is_active')
    .eq('role', 'salesperson')
    .order('name')

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, country, status, salesperson_id, created_at, months')

  const { data: payments } = await supabase
    .from('payments_view')
    .select('id, client_id, plan_sum, fact_sum, is_paid, status, plan_date, fact_date')

  const { data: expenses } = await supabase
    .from('expenses')
    .select('id, client_id, plan_sum, fact_sum, is_paid, article')
    .eq('article', 'salesperson')

  // Список доступных месяцев (последние 12)
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('ru', { month: 'long', year: 'numeric' })
    return { val, label }
  })

  const salesStats = (salespersons ?? []).map(s => {
    const myClients = (clients ?? []).filter(c => c.salesperson_id === s.id)
    const myClientIds = myClients.map(c => c.id)

    // Новые договоры за период (клиенты созданные в этом месяце)
    const newClients = myClients.filter(c => {
      const d = c.created_at?.slice(0, 10)
      return d >= periodStart && d <= periodEnd
    })
    const newContractsSum = newClients.reduce((sum, c) => {
      const myPays = (payments ?? []).filter(p => p.client_id === c.id)
      return sum + myPays.reduce((s, p) => s + Number(p.plan_sum), 0)
    }, 0)

    // Поступления факт за период
    const factPaid = (payments ?? [])
      .filter(p =>
        myClientIds.includes(p.client_id) &&
        p.is_paid &&
        p.fact_date >= periodStart &&
        p.fact_date <= periodEnd
      )
      .reduce((sum, p) => sum + Number(p.fact_sum || p.plan_sum), 0)

    // Просрочка (все времена, не только месяц)
    const overdue = (payments ?? [])
      .filter(p => myClientIds.includes(p.client_id) && p.status === 'overdue')
      .reduce((sum, p) => sum + Number(p.plan_sum), 0)

    // ЗП к выплате за период (10% от поступлений)
    const salaryDue = Math.round(factPaid * 0.1)
    const salaryPaid = (expenses ?? [])
      .filter(e =>
        myClientIds.includes(e.client_id) &&
        e.article === 'salesperson' &&
        e.is_paid
      )
      .reduce((sum, e) => sum + Number(e.fact_sum || e.plan_sum), 0)

    const pct = Math.round(factPaid / PLAN * 100)

    return {
      ...s,
      totalClients: myClients.length,
      activeClients: myClients.filter(c => c.status === 'active').length,
      newClients: newClients.length,
      newContractsSum,
      factPaid,
      overdue,
      salaryDue,
      salaryPaid,
      pct,
    }
  })

  // Итого по команде
  const teamFactPaid = salesStats.reduce((s, x) => s + x.factPaid, 0)
  const teamNewContracts = salesStats.reduce((s, x) => s + x.newContractsSum, 0)
  const teamOverdue = salesStats.reduce((s, x) => s + x.overdue, 0)
  const teamSalary = salesStats.reduce((s, x) => s + x.salaryDue, 0)
  const teamPlan = PLAN * (salespersons?.filter(s => s.is_active).length ?? 1)

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('ru', { month: 'long', year: 'numeric' })

  return (
    <div className="app">
      <Sidebar activePage="sales" userName={profile?.name || ''} userEmail={user.email || ''} />
      <div className="main">
        <div className="topbar">
          <div className="pt">Аналитика продажников</div>
          <div className="tbr">
            <form method="GET">
              <select
                name="month"
                defaultValue={monthParam}
                onChange={(e: any) => e.target.form.submit()}
                style={{ padding: '7px 12px', border: '1px solid rgba(0,0,0,.12)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#14121e', cursor: 'pointer' }}
              >
                {months.map(m => (
                  <option key={m.val} value={m.val}>{m.label}</option>
                ))}
              </select>
            </form>
          </div>
        </div>

        {/* KPI команды */}
        <div className="kw">
          <div className="kg k4" style={{ marginBottom: 14 }}>
            <div className="kc">
              <div className="kl">Новых договоров</div>
              <div className="kv p" style={{ fontSize: 17 }}>{teamNewContracts.toLocaleString('ru')} ₽</div>
              <div className="ks">{monthLabel}</div>
            </div>
            <div className="kc">
              <div className="kl">Поступило факт</div>
              <div className="kv g" style={{ fontSize: 17 }}>{teamFactPaid.toLocaleString('ru')} ₽</div>
              <div className="ks">план команды: {teamPlan.toLocaleString('ru')} ₽</div>
              <div className="kpg">
                <div className="kpf" style={{ width: `${Math.min(teamPlan > 0 ? Math.round(teamFactPaid / teamPlan * 100) : 0, 100)}%` }}></div>
              </div>
            </div>
            <div className="kc">
              <div className="kl">Просрочка</div>
              <div className="kv r" style={{ fontSize: 17 }}>{teamOverdue.toLocaleString('ru')} ₽</div>
              <div className="ks">по всем продажникам</div>
            </div>
            <div className="kc">
              <div className="kl">ЗП к выплате</div>
              <div className="kv o" style={{ fontSize: 17 }}>{teamSalary.toLocaleString('ru')} ₽</div>
              <div className="ks">10% от поступлений</div>
            </div>
          </div>
        </div>

        {/* Таблица по продажникам */}
        <div className="cnt">
          <div className="ctrl" style={{ marginBottom: 12 }}>
            <div className="sl">Эффективность — {monthLabel}</div>
          </div>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Продажник</th>
                  <th>Клиентов</th>
                  <th>Новых договоров</th>
                  <th>Поступило факт</th>
                  <th>План 900 000 ₽</th>
                  <th>% плана</th>
                  <th>Просрочка</th>
                  <th>ЗП к выплате</th>
                </tr>
              </thead>
              <tbody>
                {salesStats.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>
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
                    <td>
                      <span className="num">{s.totalClients}</span>
                      {s.newClients > 0 && (
                        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--green)', background: 'rgba(22,163,97,.1)', padding: '1px 6px', borderRadius: 10 }}>
                          +{s.newClients}
                        </span>
                      )}
                    </td>
                    <td><span className="num p">{s.newContractsSum.toLocaleString('ru')} ₽</span></td>
                    <td><span className="num g">{s.factPaid.toLocaleString('ru')} ₽</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 80, height: 5, background: 'rgba(0,0,0,.08)', borderRadius: 20, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 20,
                            width: `${Math.min(s.pct, 100)}%`,
                            background: s.pct >= 100 ? 'var(--green)' : s.pct >= 60 ? 'var(--purple)' : 'var(--red)'
                          }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{
                        fontWeight: 700, fontSize: 13,
                        color: s.pct >= 100 ? 'var(--green)' : s.pct >= 60 ? 'var(--gold)' : 'var(--red)'
                      }}>
                        {s.pct}%
                      </span>
                    </td>
                    <td>
                      {s.overdue > 0
                        ? <span className="num r">{s.overdue.toLocaleString('ru')} ₽</span>
                        : <span style={{ color: 'var(--muted)' }}>—</span>
                      }
                    </td>
                    <td>
                      <span className="num o">{s.salaryDue.toLocaleString('ru')} ₽</span>
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