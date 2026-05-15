import Link from 'next/link'

interface Props {
  activePage?: 'home' | 'shortlist' | 'scholarships' | 'updates' | 'documents'
}

const navItems: { key: NonNullable<Props['activePage']>; href: string; label: string }[] = [
  { key: 'home',         href: '/demo',               label: 'Обзор' },
  { key: 'documents',    href: '/demo/documents',     label: 'Документы' },
  { key: 'shortlist',    href: '/demo/shortlist',     label: 'Вузы' },
  { key: 'scholarships', href: '/demo/scholarships',  label: 'Стипендии' },
  { key: 'updates',      href: '/demo/updates',       label: 'Обновления' },
]

export function DemoTopNav({ activePage = 'home' }: Props) {
  return (
    <nav
      className="demo-topnav"
      style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: '1px solid var(--ds-border-soft)',
      }}
    >
      <style>{`
        @media (max-width: 720px) {
          .demo-topnav-banner { font-size: 9px !important; padding: 5px 12px !important; letter-spacing: 0.06em !important; }
          .demo-topnav-row { padding: 0 14px !important; height: 54px !important; gap: 10px !important; }
          .demo-topnav-logo-text { display: none !important; }
          .demo-topnav-logo img { height: 28px !important; }
          .demo-topnav-links { gap: 14px !important; overflow-x: auto; -webkit-overflow-scrolling: touch; flex: 1; justify-content: flex-end; }
          .demo-topnav-links::-webkit-scrollbar { display: none; }
          .demo-topnav-link { font-size: 11px !important; padding-bottom: 18px !important; margin-bottom: -18px !important; white-space: nowrap; }
        }
      `}</style>

      {/* Демо-баннер */}
      <div className="demo-topnav-banner" style={{
        background: 'linear-gradient(90deg, var(--ds-purple) 0%, var(--ds-purple-deep) 100%)',
        color: '#fff', textAlign: 'center', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        padding: '6px 16px',
      }}>
        ✨ Это демо-режим — данные не сохраняются. Тыкай всё что хочешь
      </div>

      <div
        className="demo-topnav-row"
        style={{
          maxWidth: 1200, margin: '0 auto', padding: '0 32px',
          height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24,
        }}
      >
        <Link href="/demo" className="demo-topnav-logo" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit', flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gas-logo.png" alt="Go And Study" style={{ height: 36, width: 'auto', objectFit: 'contain', display: 'block' }} />
          <span className="demo-topnav-logo-text" style={{
            fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 14,
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            Демо-кабинет
          </span>
        </Link>

        <div className="demo-topnav-links" style={{ display: 'flex', gap: 28 }}>
          {navItems.map(item => (
            <Link
              key={item.key} href={item.href}
              className="demo-topnav-link"
              style={{
                fontSize: 12, fontWeight: 600, letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: item.key === activePage ? 'var(--ds-ink)' : 'var(--ds-ink-dim)',
                textDecoration: 'none', position: 'relative',
                paddingBottom: 20, marginBottom: -20,
                borderBottom: item.key === activePage ? '2px solid var(--ds-purple)' : '2px solid transparent',
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
