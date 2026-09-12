import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { logout } from '@/app/login/actions'
import { Sidebar } from '../Sidebar'
import { SeoTabs } from './SeoTabs'

// Каркас раздела SEO. Под существующей авторизацией CRM (роль admin; позже — seo).
export default async function SeoLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/')


  return (
    <div className="app">
      <Sidebar activePage="seo" userName={profile?.name || ''} userEmail={user.email || ''} />
      <div className="main">
        <div className="topbar">
          <div className="pt">SEO · Organic Content Engine</div>
          <div className="tbr">
            <span style={{ fontSize: 11, color: 'var(--muted)', padding: '2px 8px', border: '1px solid var(--bor2)', borderRadius: 6 }}>M0 · фундамент</span>
            <form action={logout}><button className="btn-s">Выйти</button></form>
          </div>
        </div>
        <SeoTabs />
        <div style={{ flex: 1, padding: '18px 28px 40px', overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  )
}
