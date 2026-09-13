import { logout } from '@/app/login/actions'
import { SeoTabs } from './SeoTabs'

// Каркас раздела SEO. Сайдбар и проверка роли — в оболочке админки (app/admin/layout.tsx):
// здесь остаётся только то, что своё у раздела.
export default async function SeoLayout({ children }: { children: React.ReactNode }) {
  return (
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
  )
}
