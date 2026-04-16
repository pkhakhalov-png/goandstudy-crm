import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SalesPage } from './SalesPage'
import { SalesSidebar } from './SalesSidebar'

export default async function SalesCabinetPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin/clients')
  if (profile?.role === 'rop') redirect('/rop')

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [
    { data: rawClients },
    { data: payments },
    { data: allCurators },
    { data: allSalespersons },
    { data: allClients },
    { data: salesPlans },
  ] = await Promise.all([
    supabase.from('clients').select('id, name, phone, email, telegram, country, university, status, months, created_at, salesperson_id, curator_id').eq('salesperson_id', user.id).order('created_at', { ascending: false }),
    supabase.from('payments_view').select('id, client_id, num, plan_date, plan_sum, fact_sum, fact_date, is_paid, status, comment'),
    supabase.from('curators').select('id, name'),
    (await createAdminClient()).from('users').select('id, name, is_active').eq('role', 'salesperson').eq('is_active', true),
    (await createAdminClient()).from('clients').select('id, salesperson_id'),
    (await createAdminClient()).from('sales_plans').select('salesperson_id, plan_amount').eq('month', currentMonth),
  ])

  const clientIds = (rawClients ?? []).map(c => c.id)

  const { data: expenses } = clientIds.length > 0
    ? await supabase
        .from('expenses')
        .select('id, client_id, plan_sum, fact_sum, is_paid, fact_date, plan_date, article')
        .eq('article', 'salesperson')
        .in('client_id', clientIds)
    : { data: [] }

  const clients = (rawClients ?? []).map(c => ({
    ...c,
    curator: allCurators?.find(cur => cur.id === c.curator_id) ?? null,
    payments: (payments ?? []).filter(p => p.client_id === c.id)
  }))

  const initials = (profile?.name || user.email || 'ПП')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <SalesSidebar
        userName={profile?.name || ''}
        userEmail={user.email || ''}
        initials={initials}
      />
      <div className="main">
        <div className="topbar">
          <div className="pt">Мои клиенты</div>
          <div className="tbr">
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{clients.length} клиентов</span>
            <Link href="/sales/new" style={{ padding: '9px 18px', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.2">
                <line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/>
              </svg>
              Новый клиент
            </Link>
          </div>
        </div>
        {/* Leaderboard — department progress (competition) */}
        <SalesPage clients={clients} expenses={expenses ?? []} />
        {(allSalespersons ?? []).length > 0 && (() => {
          const cBySp: Record<string, number[]> = {}
          ;(allClients ?? []).forEach((c: any) => { if (c.salesperson_id) { if (!cBySp[c.salesperson_id]) cBySp[c.salesperson_id] = []; cBySp[c.salesperson_id].push(c.id) } })
          const board = (allSalespersons ?? []).map((sp: any) => {
            const cIds = cBySp[sp.id] || []
            const fact = (payments ?? []).filter((p: any) => p.is_paid && cIds.includes(p.client_id) && (p.fact_date || p.plan_date || '').startsWith(currentMonth)).reduce((s: number, p: any) => s + Number(p.fact_sum ?? p.plan_sum), 0)
            const plan = (salesPlans ?? []).find((p: any) => p.salesperson_id === sp.id)
            const planAmt = plan ? Number(plan.plan_amount) : 0
            const pct = planAmt > 0 ? Math.round(fact / planAmt * 100) : 0
            return { ...sp, fact, planAmt, pct }
          }).sort((a: any, b: any) => b.fact - a.fact)
          const totalFact = board.reduce((s: number, sp: any) => s + sp.fact, 0)
          const deptPlan = (salesPlans ?? []).find((p: any) => !p.salesperson_id)
          const deptAmt = deptPlan ? Number(deptPlan.plan_amount) : 0
          const deptPct = deptAmt > 0 ? Math.round(totalFact / deptAmt * 100) : 0

          return (
            <div style={{ padding: '20px 24px', borderTop: '1px solid var(--bor2)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 10 }}>Лидерборд отдела — {currentMonth}</div>
              {deptAmt > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '10px 14px', background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 6, background: 'var(--bor)', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${Math.min(deptPct, 100)}%`, background: deptPct >= 80 ? 'var(--green)' : deptPct >= 50 ? 'var(--gold)' : 'var(--red)', borderRadius: 3 }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: deptPct >= 80 ? 'var(--green)' : deptPct >= 50 ? 'var(--gold)' : 'var(--red)' }}>{deptPct}% отдел</span>
                </div>
              )}
              {board.map((sp: any, idx: number) => (
                <div key={sp.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 10, marginBottom: 4, background: sp.id === user.id ? 'rgba(22,163,97,.06)' : 'transparent', border: sp.id === user.id ? '1px solid rgba(22,163,97,.2)' : '1px solid transparent' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, width: 24, color: idx === 0 ? 'var(--gold)' : 'var(--muted)' }}>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: sp.id === user.id ? 700 : 500 }}>{sp.name}{sp.id === user.id ? ' (вы)' : ''}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>{Math.round(sp.fact).toLocaleString('ru')} ₽</span>
                  <div style={{ width: 80, height: 6, background: 'var(--bor)', borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${Math.min(sp.pct, 100)}%`, background: sp.pct >= 80 ? 'var(--green)' : sp.pct >= 50 ? 'var(--gold)' : 'var(--red)', borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: sp.pct >= 80 ? 'var(--green)' : sp.pct >= 50 ? 'var(--gold)' : 'var(--red)', width: 35 }}>{sp.pct}%</span>
                </div>
              ))}
            </div>
          )
        })()}
      </div>
    </div>
  )
}