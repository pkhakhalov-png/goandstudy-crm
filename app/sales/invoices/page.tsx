import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SalesSidebar } from '../SalesSidebar'
import { InvoicesClient } from '../../admin/invoices/InvoicesClient'

export default async function SalesInvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin/invoices')

  const initials = (profile?.name || user.email || 'ПП')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  const [
    { data: invoices },
    { data: clients },
  ] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, client_id, amount, description, order_id, payment_id, payment_url, sbp_payload, status, created_by, created_at, clients(name), users:created_by(name)')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('clients')
      .select('id, name')
      .eq('salesperson_id', user.id)
      .neq('status', 'completed')
      .order('name'),
  ])

  return (
    <div className="app">
      <SalesSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="invoices" />
      <div className="main">
        <div className="topbar">
          <div className="pt">Счета</div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>СБП · T-Bank</span>
        </div>
        <InvoicesClient
          invoices={invoices ?? []}
          clients={clients ?? []}
        />
      </div>
    </div>
  )
}
