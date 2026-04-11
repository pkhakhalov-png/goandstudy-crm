import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '../../Sidebar'
import { DealCard } from './DealCard'

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
    { data: deal },
    { data: stages },
    { data: activities },
    { data: salespersons },
    { data: allUsers },
    { data: files },
    { data: messages },
    { data: tasks },
  ] = await Promise.all([
    supabase.from('deals').select('*').eq('id', id).single(),
    supabase.from('pipeline_stages').select('*').eq('is_active', true).order('position'),
    supabase.from('deal_activities').select('*').eq('deal_id', id).order('created_at', { ascending: false }),
    supabase.from('users').select('id, name').eq('role', 'salesperson').eq('is_active', true).order('name'),
    supabase.from('users').select('id, name'),
    supabase.from('deal_files').select('*').eq('deal_id', id).order('created_at', { ascending: false }),
    supabase.from('deal_messages').select('*').eq('deal_id', id).order('created_at', { ascending: true }),
    supabase.from('deal_tasks').select('*').eq('deal_id', id).order('created_at', { ascending: true }),
  ])

  if (!deal) redirect('/admin/funnel')

  const userMap = new Map((allUsers ?? []).map(u => [u.id, u.name]))
  const enrichedActivities = (activities ?? []).map(a => ({
    ...a,
    user_name: userMap.get(a.user_id) ?? 'Система',
  }))

  // Get linked client data if exists
  let clientData = null
  if (deal.client_id) {
    const { data } = await supabase
      .from('clients')
      .select('id, name, country, university, status, months')
      .eq('id', deal.client_id)
      .single()
    clientData = data
  }

  // Get linked booking if exists
  let bookingData = null
  if (deal.booking_id) {
    const { data } = await supabase
      .from('bookings')
      .select('id, booking_date, start_time, end_time, status')
      .eq('id', deal.booking_id)
      .single()
    bookingData = data
  }

  return (
    <div className="app">
      <Sidebar activePage="funnel" userName={profile?.name || ''} userEmail={user.email || ''} />
      <DealCard
        deal={deal}
        stages={stages ?? []}
        activities={enrichedActivities}
        salespersons={salespersons ?? []}
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
