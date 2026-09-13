import { createClient } from '@/lib/supabase/server'
import { InvoicesClient } from './InvoicesClient'

export default async function AdminInvoicesPage() {
  const supabase = await createClient()
  const [
    { data: invoices },
    { data: clients },
  ] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, client_id, amount, description, order_id, payment_id, payment_url, sbp_payload, status, created_by, created_at, clients(name), users:created_by(name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('clients')
      .select('id, name')
      .neq('status', 'completed')
      .order('name'),
  ])

  return (
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
  )
}
