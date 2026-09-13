import { createClient } from '@/lib/supabase/server'
import { logout } from '@/app/login/actions'
import { PaymentsClient } from './PaymentsClient'

export default async function AdminPaymentsPage() {
  const supabase = await createClient()
  const [
    { data: rawClients },
    { data: allUsers },
    { data: allCurators },
    { data: rawPayments },
    { data: salespersons },
    { data: curators },
  ] = await Promise.all([
    supabase.from('clients').select('id, name, phone, country, status, salesperson_id, curator_id'),
    supabase.from('users').select('id, name'),
    supabase.from('curators').select('id, name'),
    supabase.from('payments_view').select('id, client_id, num, plan_date, plan_sum, fact_sum, fact_date, is_paid, status, comment').order('plan_date', { ascending: true }),
    supabase.from('users').select('id, name').eq('role', 'salesperson').eq('is_active', true).order('name'),
    supabase.from('curators').select('id, name').eq('is_active', true).order('name'),
  ])

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const soonThreshold = new Date(today)
  soonThreshold.setDate(soonThreshold.getDate() + 7)

  const payments = (rawPayments ?? []).map(p => {
    const client = rawClients?.find(c => c.id === p.client_id)

    // Recompute status client-side: the DB view only knows 'paid'/'overdue'/'soon',
    // but we need a 'pending' bucket for payments further than 7 days out.
    let status: string = p.status
    if (!p.is_paid) {
      const planDate = new Date(p.plan_date + 'T00:00:00')
      if (planDate < today) {
        status = 'overdue'
      } else if (planDate <= soonThreshold) {
        status = 'soon'
      } else {
        status = 'pending'
      }
    } else {
      status = 'paid'
    }

    return {
      ...p,
      status,
      clients: client ? {
        ...client,
        salesperson_name: allUsers?.find(u => u.id === client.salesperson_id)?.name ?? '—',
        curator_name: allCurators?.find(c => c.id === client.curator_id)?.name ?? '—',
      } : null
    }
  })

  return (
    <PaymentsClient
      allPayments={payments}
      allClients={[]}
      salespersons={salespersons ?? []}
      curators={curators ?? []}
    />
  )
}