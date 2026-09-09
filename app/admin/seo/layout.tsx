import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { logout } from '@/app/login/actions'
import { Sidebar } from '../Sidebar'

// Каркас раздела SEO. Под существующей авторизацией CRM (роль admin; позже — seo).
export default async function SeoLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/')

  const tabs = [
    { href: '/admin/seo', label: 'Обзор' },
    { href: '/admin/seo/opportunities', label: 'Возможности' },
    { href: '/admin/seo/pages', label: 'Страницы' },
    { href: '/admin/seo/clusters', label: 'Кластеры' },
    { href: '/admin/seo/topics', label: 'Статьи' },
    { href: '/admin/seo/findings', label: 'Находки' },
    { href: '/admin/seo/experts', label: 'Эксперт' },
  ]

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
        <div style={{ display: 'flex', gap: 8, padding: '10px 28px', borderBottom: '1px solid var(--bor)', background: 'var(--surf)' }}>
          {tabs.map(t => (
            <Link key={t.href} href={t.href} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, color: 'var(--text)', textDecoration: 'none', border: '1px solid var(--bor2)', background: 'var(--surf2)' }}>
              {t.label}
            </Link>
          ))}
        </div>
        <div style={{ flex: 1, padding: '18px 28px 40px', overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  )
}
