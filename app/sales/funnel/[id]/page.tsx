import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SalesSidebar } from '../../SalesSidebar'
import { DealCard } from '../../../admin/funnel/[id]/DealCard'

export default async function SalesDealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role === 'admin') redirect(`/admin/funnel/${id}`)

  const initials = (profile?.name || user.email || 'ПП')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  const [
    { data: deal },
    { data: stages },
    { data: activities },
    { data: allUsers },
    { data: files },
    { data: messages },
    { data: tasks },
  ] = await Promise.all([
    supabase.from('deals').select('*').eq('id', id).single(),
    supabase.from('pipeline_stages').select('*').eq('is_active', true).order('position'),
    supabase.from('deal_activities').select('*').eq('deal_id', id).order('created_at', { ascending: false }),
    supabase.from('users').select('id, name'),
    supabase.from('deal_files').select('*').eq('deal_id', id).order('created_at', { ascending: false }),
    supabase.from('deal_messages').select('*').eq('deal_id', id).order('created_at', { ascending: true }),
    supabase.from('deal_tasks').select('*').eq('deal_id', id).order('created_at', { ascending: true }),
  ])

  if (!deal || deal.salesperson_id !== user.id) redirect('/sales/funnel')

  const userMap = new Map((allUsers ?? []).map(u => [u.id, u.name]))
  const enrichedActivities = (activities ?? []).map(a => ({ ...a, user_name: userMap.get(a.user_id) ?? 'Система' }))

  let clientData = null
  if (deal.client_id) {
    const { data } = await supabase.from('clients').select('id, name, country, university, status, months').eq('id', deal.client_id).single()
    clientData = data
  }

  let bookingData = null
  if (deal.booking_id) {
    const { data } = await supabase.from('bookings').select('id, booking_date, start_time, end_time, status').eq('id', deal.booking_id).single()
    bookingData = data
  }

  return (
    <div className="app">
      <SalesSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="funnel" />
      <DealCard
        deal={deal}
        stages={stages ?? []}
        activities={enrichedActivities}
        salespersons={[{ id: user.id, name: profile?.name || '' }]}
        clientData={clientData}
        bookingData={bookingData}
        files={files ?? []}
        messages={messages ?? []}
        tasks={tasks ?? []}
        userId={user.id}
      />
    </div>
  )
}
