import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CuratorSidebar } from '../CuratorSidebar'
import { GuideContent } from './GuideContent'

export default async function CuratorGuidePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') redirect('/login')

  const admin = await createAdminClient()

  const [
    { data: stages },
    { data: checklist },
  ] = await Promise.all([
    admin.from('curator_stages').select('*').order('position'),
    admin.from('curator_stage_checklist').select('*').order('position'),
  ])

  const initials = (profile?.name || user.email || 'КР')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <CuratorSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="guide" />
      <div className="main">
        <div className="topbar"><div className="pt">Регламент</div></div>
        <GuideContent stages={stages ?? []} checklist={checklist ?? []} />
      </div>
    </div>
  )
}
