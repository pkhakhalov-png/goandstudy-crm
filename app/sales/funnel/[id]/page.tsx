import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SalesSidebar } from '../../SalesSidebar'
import { DealCard } from '../../../admin/funnel/[id]/DealCard'

export default async function SalesDealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: profile },
    { data: deal },
    { data: stages },
    { data: activities },
    { data: allUsers },
    { data: files },
    { data: messages },
    { data: tasks },
  ] = await Promise.all([
    supabase.from('users').select('name, role').eq('id', user.id).single(),
    supabase.from('deals').select('*').eq('id', id).single(),
    supabase.from('pipeline_stages').select('id, name, color, position, stage_type').eq('is_active', true).order('position'),
    supabase.from('deal_activities').select('id, deal_id, user_id, activity_type, content, metadata, created_at').eq('deal_id', id).order('created_at', { ascending: false }),
    supabase.from('users').select('id, name'),
    supabase.from('deal_files').select('id, deal_id, name, url, size, mime_type, source, created_at').eq('deal_id', id).order('created_at', { ascending: false }),
    supabase.from('deal_messages').select('id, deal_id, direction, channel, sender_name, content, file_id, created_at').eq('deal_id', id).order('created_at', { ascending: true }),
    supabase.from('deal_tasks').select('id, deal_id, title, deadline, is_done, assigned_to, completed_at, created_at').eq('deal_id', id).order('created_at', { ascending: true }),
  ])

  if (profile?.role === 'admin') redirect(`/admin/funnel/${id}`)
  if (profile?.role === 'rop') redirect('/rop')
  if (!deal || deal.salesperson_id !== user.id) redirect('/sales/funnel')

  const initials = (profile?.name || user.email || 'ПП')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  const userMap = new Map((allUsers ?? []).map(u => [u.id, u.name]))
  const enrichedActivities = (activities ?? []).map(a => ({ ...a, user_name: userMap.get(a.user_id) ?? 'Система' }))

  const [clientData, bookingData] = await Promise.all([
    deal.client_id
      ? supabase.from('clients').select('id, name, country, university, status, months').eq('id', deal.client_id).single().then(r => r.data)
      : null,
    deal.booking_id
      ? supabase.from('bookings').select('id, booking_date, start_time, end_time, status').eq('id', deal.booking_id).single().then(r => r.data)
      : null,
  ])

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
