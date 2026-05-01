'use client'

import Link from 'next/link'
import { logout } from '@/app/login/actions'

interface Props {
  userName: string
  activePage?: 'home' | 'documents' | 'shortlist' | 'scholarships' | 'curator'
  /** Не используется — оставлен для обратной совместимости со старыми вызовами. */
  showScholarships?: boolean
}

const navItems: { key: NonNullable<Props['activePage']>; href: string; label: string }[] = [
  { key: 'home', href: '/client', label: 'Обзор' },
  { key: 'documents', href: '/client/documents', label: 'Документы' },
  { key: 'shortlist', href: '/client/shortlist', label: 'Вузы' },
  { key: 'scholarships', href: '/client/scholarships', label: 'Стипендии' },
  { key: 'curator', href: '/client/curator', label: 'Куратор' },
]

export function ClientTopNav({ userName, activePage = 'home' }: Props) {
  const initials = (userName || 'МИ')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(255,255,255,0.78)',
        backdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: '1px solid var(--ds-border-soft)',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '0 32px',
          height: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
        }}
      >
        <Link
          href="/client"
          style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}
        >
          <div className="ds-logo-mark">
            <span>GO</span>
            <span>AND</span>
            <span>STUDY</span>
          </div>
          <span
            style={{
              fontFamily: 'var(--ds-font-display-stack)',
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            Личный кабинет
          </span>
        </Link>

        <div style={{ display: 'flex', gap: 28 }}>
          {navItems.map(item => (
            <Link
              key={item.key}
              href={item.href}
              data-tour={item.key === 'curator' ? 'curator-link' : undefined}
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: item.key === activePage ? 'var(--ds-ink)' : 'var(--ds-ink-dim)',
                textDecoration: 'none',
                position: 'relative',
                paddingBottom: 20,
                marginBottom: -20,
                borderBottom: item.key === activePage ? '2px solid var(--ds-purple)' : '2px solid transparent',
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right', fontSize: 12, lineHeight: 1.2 }}>
            <div style={{ fontWeight: 600, color: 'var(--ds-ink)' }}>{userName || 'Клиент'}</div>
            <form action={logout} style={{ margin: 0 }}>
              <button
                type="submit"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  margin: 0,
                  color: 'var(--ds-muted)',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  letterSpacing: 0,
                }}
              >
                Выйти
              </button>
            </form>
          </div>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--ds-purple), var(--ds-purple-deep))',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            {initials}
          </div>
        </div>
      </div>
    </nav>
  )
}
