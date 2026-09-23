'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Разделы контент-машины.
 *
 * Порядок не алфавитный и не по важности вообще, а по ходу материала: пакет
 * появился → его адаптировали → проверили → поставили в календарь → он вышел.
 * Отдельно то, что требует человека, и то, за чем смотрят.
 */
const GROUPS: { title: string; tabs: { href: string; label: string }[] }[] = [
  {
    title: 'Материал',
    tabs: [
      { href: '/admin/content/packages', label: 'Пакеты' },
      { href: '/admin/content/reviews', label: 'Проверки' },
      { href: '/admin/content/calendar', label: 'Календарь' },
      { href: '/admin/content/export', label: 'Ждут рук' },
      { href: '/admin/content/publications', label: 'Публикации' },
      { href: '/admin/content/vk', label: 'Выпуск в VK' },
    ],
  },
  {
    title: 'Наблюдение',
    tabs: [
      { href: '/admin/content', label: 'Обзор' },
      { href: '/admin/content/attention', label: 'Требуют внимания' },
      { href: '/admin/content/channels', label: 'Каналы' },
      { href: '/admin/content/connections', label: 'Подключения' },
    ],
  },
]

export function ContentTabs() {
  const path = usePathname()
  return (
    <div style={{ padding: '10px 28px', borderBottom: '1px solid var(--bor)', background: 'var(--surf)' }}>
      {GROUPS.map((g) => (
        <div key={g.title} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', minWidth: 86 }}>
            {g.title}
          </span>
          {g.tabs.map((t) => {
            const active = t.href === '/admin/content' ? path === t.href : path.startsWith(t.href)
            return (
              <Link key={t.href} href={t.href}
                style={{
                  padding: '5px 13px', borderRadius: 8, fontSize: 13, textDecoration: 'none',
                  border: `1px solid ${active ? 'var(--purple)' : 'var(--bor2)'}`,
                  background: active ? 'rgba(177,94,204,.10)' : 'var(--surf2)',
                  color: active ? 'var(--purple)' : 'var(--text)',
                  fontWeight: active ? 600 : 400,
                }}>
                {t.label}
              </Link>
            )
          })}
        </div>
      ))}
    </div>
  )
}
