import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from './admin/Sidebar'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin/clients')
  if (profile?.role === 'rop') redirect('/rop')
  if (profile?.role === 'curator') redirect('/curator')
  if (profile?.role === 'client') redirect('/client')
  redirect('/sales')

  return (
    <div className="app">
      <Sidebar activePage="home" userName={profile?.name || ''} userEmail={user.email || ''} />
      <div className="main">
        <div className="topbar">
          <div className="pt">Главная</div>
        </div>
        <div className="cnt">
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Добро пожаловать в CRM Go & Study. Выберите раздел в меню слева.
          </p>
        </div>
      </div>
    </div>
  )
}