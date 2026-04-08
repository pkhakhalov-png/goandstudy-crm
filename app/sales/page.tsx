import { createClient } from '@/lib/supabase/server'
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

  const { data: rawClients } = await supabase
    .from('clients')
    .select('id, name, phone, email, telegram, country, university, status, months, created_at, salesperson_id, curator_id')
    .eq('salesperson_id', user.id)
    .order('created_at', { ascending: false })

  const { data: payments } = await supabase
    .from('payments_view')
    .select('id, client_id, num, plan_date, plan_sum, fact_sum, fact_date, is_paid, status, comment')

  const { data: allCurators } = await supabase.from('curators').select('id, name')

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
        <SalesPage clients={clients} expenses={expenses ?? []} />
      </div>
    </div>
  )
}