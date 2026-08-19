import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { logout } from '@/app/login/actions'
import { ClientsPage } from './ClientsPage'
import { Sidebar } from '../Sidebar'

export default async function AdminClientsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/sales')

  const [
    { data: rawClients },
    { data: payments },
    { data: allUsers },
    { data: allCurators },
    { data: salespersons },
    { data: curators },
    { data: expenses },
    { data: invoices },
  ] = await Promise.all([
    supabase.from('clients').select('id, name, phone, email, telegram, country, university, status, months, created_at, salesperson_id, curator_id, tg_group_chat_id, tg_group_title, expected_offer_month').order('created_at', { ascending: false }),
    supabase.from('payments_view').select('id, client_id, num, plan_date, plan_sum, fact_sum, is_paid, status'),
    supabase.from('users').select('id, name'),
    supabase.from('curators').select('id, name'),
    supabase.from('users').select('id, name').eq('role', 'salesperson').eq('is_active', true).order('name'),
    supabase.from('curators').select('id, name').eq('is_active', true).order('name'),
    supabase.from('expenses').select('id, client_id, article, plan_sum, fact_sum, is_paid, plan_date'),
    supabase.from('invoices').select('id, client_id, amount, description, status, payment_url, created_at'),
  ])

  const clients = (rawClients ?? []).map(c => ({
    ...c,
    salesperson: allUsers?.find(u => u.id === c.salesperson_id) ?? null,
    curator: allCurators?.find(cur => cur.id === c.curator_id) ?? null,
    payments: (payments ?? []).filter(p => p.client_id === c.id),
    expenses: (expenses ?? []).filter(e => e.client_id === c.id),
    invoices: (invoices ?? []).filter(i => i.client_id === c.id),
  }))

  return (
    <div className="app">
      <Sidebar activePage="clients" userName={profile?.name || ''} userEmail={user.email || ''} />
      <div className="main">
        <div className="topbar">
          <div className="pt">Клиенты</div>
          <div className="tbr">
            <span style={{fontSize:12,color:'var(--muted)'}}>{new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}</span>
            <span style={{fontSize:12, color:'var(--muted)'}}>{clients.length} клиентов</span>
            <Link href="/admin/clients/new" className="btn-p">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.2">
                <line x1="6" y1="1" x2="6" y2="11"/>
                <line x1="1" y1="6" x2="11" y2="6"/>
              </svg>
              Новый клиент
            </Link>
            <form action={logout}>
              <button className="btn-s">Выйти</button>
            </form>
          </div>
        </div>
        <ClientsPage clients={clients} salespersons={salespersons ?? []} curators={curators ?? []} />
      </div>
    </div>
  )
}