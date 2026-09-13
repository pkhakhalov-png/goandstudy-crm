import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { InvoicesClient } from '../../admin/invoices/InvoicesClient'
import { viewer } from '@/lib/auth/viewer'

export default async function SalesInvoicesPage() {
  const supabase = await createClient()
  // Профиль читается общей функцией: оболочка раздела спрашивает то же самое,
  // и без неё это был бы второй одинаковый поход в базу за тот же запрос
  const { user, profile } = await viewer()
  if (!user) redirect('/login')

  if (profile?.role === 'admin') redirect('/admin/invoices')
  if (profile?.role === 'rop') redirect('/rop')

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
