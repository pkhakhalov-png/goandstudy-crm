import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { logout } from '@/app/login/actions'
import { PaymentsClient } from './PaymentsClient'
import { Sidebar } from '../Sidebar'

export default async function AdminPaymentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/sales')

  const { data: rawClients } = await supabase
    .from('clients')
    .select('id, name, phone, country, status, salesperson_id, curator_id')

  const { data: allUsers } = await supabase.from('users').select('id, name')
  const { data: allCurators } = await supabase.from('curators').select('id, name')

  const { data: rawPayments } = await supabase
    .from('payments_view')
    .select('id, client_id, num, plan_date, plan_sum, fact_sum, fact_date, is_paid, status, comment')
    .order('plan_date', { ascending: true })

  const payments = (rawPayments ?? []).map(p => {
    const client = rawClients?.find(c => c.id === p.client_id)
    return {
      ...p,
      clients: client ? {
        ...client,
        salesperson_name: allUsers?.find(u => u.id === client.salesperson_id)?.name ?? '—',
        curator_name: allCurators?.find(c => c.id === client.curator_id)?.name ?? '—',
      } : null
    }
  })

  const { data: salespersons } = await supabase
    .from('users').select('id, name').eq('role', 'salesperson').eq('is_active', true).order('name')

  const { data: curators } = await supabase
    .from('curators').select('id, name').eq('is_active', true).order('name')

  return (
    <div className="app">
      <Sidebar activePage="payments" userName={profile?.name || ''} userEmail={user.email || ''} />
      <PaymentsClient
        allPayments={payments}
        allClients={[]}
        salespersons={salespersons ?? []}
        curators={curators ?? []}
      />
    </div>
  )
}