import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CuratorSidebar } from '../CuratorSidebar'
import { TemplatesList } from './TemplatesList'

export default async function CuratorTemplatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') redirect('/login')

  const admin = await createAdminClient()
  const { data: templates } = await admin
    .from('curator_templates')
    .select('*')
    .eq('is_active', true)
    .order('category')

  const initials = (profile?.name || user.email || 'КР')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <CuratorSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="templates" />
      <div className="main">
        <div className="topbar">
          <div className="pt">Шаблоны</div>
          <div className="tbr">
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{(templates ?? []).length} шаблонов</span>
          </div>
        </div>
        <TemplatesList templates={templates ?? []} />
      </div>
    </div>
  )
}
