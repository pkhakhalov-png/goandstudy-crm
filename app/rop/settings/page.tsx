import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RopSidebar } from '../RopSidebar'
import { RopSettings } from './RopSettings'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'rop' && profile?.role !== 'admin') redirect('/sales')

  const { data: settings } = await supabase.from('rop_settings').select('key, value')
  const { data: stages } = await supabase.from('pipeline_stages').select('id, name, position, stage_type, weight').eq('is_active', true).order('position')

  const initials = (profile?.name || user.email || 'РП').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <RopSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="settings" />
      <div className="main">
        <div className="topbar"><div className="pt">Настройки РОП</div></div>
        <div style={{ padding: '20px 24px', maxWidth: 700 }}>
          <RopSettings settings={settings ?? []} stages={stages ?? []} />
        </div>
      </div>
    </div>
  )
}
