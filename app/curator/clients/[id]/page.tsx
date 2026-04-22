import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { CuratorSidebar } from '../../CuratorSidebar'
import { ClientCard } from './ClientCard'

export default async function CuratorClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const clientId = Number(id)
  if (!clientId) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') redirect('/login')

  const admin = await createAdminClient()

  const { data: curatorRecord } = await admin.from('curators').select('id').eq('user_id', user.id).maybeSingle()
  const curatorId = curatorRecord?.id

  // Load client (only if belongs to this curator)
  const { data: client } = await admin
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('curator_id', curatorId || '')
    .single()

  if (!client) notFound()

  const [
    { data: stages },
    { data: clientStages },
    { data: universities },
    { data: documents },
    { data: activities },
    { data: checklist },
    { data: checklistProgress },
    { data: messages },
    { data: files },
    { data: shortlists },
  ] = await Promise.all([
    admin.from('curator_stages').select('*').order('position'),
    admin.from('client_stages').select('*').eq('client_id', clientId),
    admin.from('client_universities').select('*').eq('client_id', clientId),
    admin.from('client_documents').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    admin.from('client_activities').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    admin.from('curator_stage_checklist').select('*').order('position'),
    admin.from('client_checklist_progress').select('*').eq('client_id', clientId),
    admin.from('client_tg_messages').select('*').eq('client_id', clientId).order('created_at', { ascending: true }),
    admin.from('client_tg_files').select('*').eq('client_id', clientId),
    admin.from('client_shortlists').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
  ])

  const initials = (profile?.name || user.email || 'КР')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <CuratorSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="clients" />
      <ClientCard
        client={client}
        stages={stages ?? []}
        clientStages={clientStages ?? []}
        universities={universities ?? []}
        documents={documents ?? []}
        activities={activities ?? []}
        checklist={checklist ?? []}
        checklistProgress={checklistProgress ?? []}
        messages={messages ?? []}
        files={files ?? []}
        shortlists={shortlists ?? []}
        curatorId={curatorId || ''}
      />
    </div>
  )
}
