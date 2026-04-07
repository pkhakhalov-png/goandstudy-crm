import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '../Sidebar'
import { SettingsClient } from './SettingsClient'

export default async function AdminSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/sales')

  const { data: salespersons } = await supabase
    .from('users')
    .select('id, name, email, is_active, created_at')
    .eq('role', 'salesperson')
    .order('created_at', { ascending: true })

  const { data: curators } = await supabase
    .from('curators')
    .select('id, name, is_active, created_at')
    .order('created_at', { ascending: true })

  return (
    <div className="app">
      <Sidebar activePage="settings" userName={profile?.name || ''} userEmail={user.email || ''} />
      <div className="main">
        <div className="topbar">
          <div className="pt">Настройки</div>
        </div>
        <SettingsClient
          salespersons={salespersons ?? []}
          curators={curators ?? []}
        />
      </div>
    </div>
  )
}