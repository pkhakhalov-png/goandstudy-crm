import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CuratorSidebar } from './CuratorSidebar'

export default async function CuratorHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') redirect('/login')

  const initials = (profile?.name || user.email || 'КР')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <CuratorSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="home" />
      <div className="main">
        <div className="topbar"><div className="pt">Кабинет куратора</div></div>
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Главная</div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 8 }}>В разработке</div>
        </div>
      </div>
    </div>
  )
}
