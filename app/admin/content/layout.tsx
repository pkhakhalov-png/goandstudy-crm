import { logout } from '@/app/login/actions'
import { ContentTabs } from './ContentTabs'

export default async function ContentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="main">
      <div className="topbar">
        <div className="pt">Контент · пакеты и публикации</div>
        <div className="tbr">
          <span style={{ fontSize: 11, color: 'var(--muted)', padding: '2px 8px', border: '1px solid var(--bor2)', borderRadius: 6 }}>
            E4 · строится
          </span>
          <form action={logout}><button className="btn-s">Выйти</button></form>
        </div>
      </div>
      <ContentTabs />
      <div style={{ flex: 1, padding: '18px 28px 40px', overflowY: 'auto' }}>{children}</div>
    </div>
  )
}
