import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RopSidebar } from '../../RopSidebar'
import { DealCard } from '../../../admin/funnel/[id]/DealCard'

export default async function RopDealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: profile },
    { data: deal },
    { data: stages },
    { data: activities },
    { data: salespersons },
    { data: allUsers },
    { data: files },
    { data: messages },
    { data: tasks },
  ] = await Promise.all([
    supabase.from('users').select('name, role').eq('id', user.id).single(),
    supabase.from('deals').select('*').eq('id', id).single(),
    supabase.from('pipeline_stages').select('id, name, color, position, stage_type').eq('is_active', true).order('position'),
    supabase.from('deal_activities').select('id, deal_id, user_id, activity_type, content, metadata, created_at').eq('deal_id', id).order('created_at', { ascending: false }),
    supabase.from('users').select('id, name').eq('role', 'salesperson').eq('is_active', true).order('name'),
    supabase.from('users').select('id, name'),
    supabase.from('deal_files').select('id, deal_id, name, url, size, mime_type, source, created_at').eq('deal_id', id).order('created_at', { ascending: false }),
    supabase.from('deal_messages').select('id, deal_id, direction, channel, sender_name, content, file_id, created_at').eq('deal_id', id).order('created_at', { ascending: true }),
    supabase.from('deal_tasks').select('id, deal_id, title, deadline, is_done, assigned_to, completed_at, created_at').eq('deal_id', id).order('created_at', { ascending: true }),
  ])

  if (profile?.role !== 'rop' && profile?.role !== 'admin') redirect('/sales')
  if (!deal) redirect('/rop/funnel')

  const userMap = new Map((allUsers ?? []).map(u => [u.id, u.name]))
  const enrichedActivities = (activities ?? []).map(a => ({ ...a, user_name: userMap.get(a.user_id) ?? 'Система' }))

  const admin = await createAdminClient()
  const [
    { data: curators },
    { data: groupDeals },
  ] = await Promise.all([
    admin.from('curators').select('id, name').eq('is_active', true).order('name'),
    admin.from('deals').select('id, title, custom_fields').not('custom_fields->>group_chat_id', 'is', null).is('deleted_at', null),
  ])

  const availableGroups = (groupDeals ?? []).map(d => ({
    chat_id: d.custom_fields?.group_chat_id || d.custom_fields?.tg_chat_id,
    title: d.custom_fields?.tg_chat_title || d.title,
  })).filter(g => g.chat_id)

  const [clientData, bookingData] = await Promise.all([
    deal.client_id
      ? supabase.from('clients').select('id, name, country, university, status, months').eq('id', deal.client_id).single().then(r => r.data)
      : null,
    deal.booking_id
      ? supabase.from('bookings').select('id, booking_date, start_time, end_time, status').eq('id', deal.booking_id).single().then(r => r.data)
      : null,
  ])

  const initials = (profile?.name || user.email || 'РП').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <RopSidebar activePage="funnel" userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} />
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
        curators={curators ?? []}
        availableGroups={availableGroups}
        backUrl="/rop/funnel"
      />
    </div>
  )
}
