'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Разделы SEO, собранные по смыслу.
 *
 * Тринадцать кнопок в один ряд не помещались и выглядели одинаково важными,
 * хотя в «Статьи» заходят каждый день, а в «Кластеры» — раз в месяц. Поэтому
 * группы: сначала работа, потом наблюдение, потом справочники.
 */
const GROUPS: { title: string; tabs: { href: string; label: string }[] }[] = [
  {
    title: 'Работа',
    tabs: [
      { href: '/admin/seo/articles', label: 'Статьи' },
      { href: '/admin/seo/topics', label: 'Темы' },
      { href: '/admin/seo/opportunities', label: 'Возможности' },
      { href: '/admin/seo/findings', label: 'Находки' },
    ],
  },
  {
    title: 'Наблюдение',
    tabs: [
      { href: '/admin/seo', label: 'Обзор' },
      { href: '/admin/seo/positions', label: 'Позиции' },
      { href: '/admin/seo/indexation', label: 'Индексация' },
      { href: '/admin/seo/effect', label: 'Эффект' },
    ],
  },
  {
    title: 'Справочно',
    tabs: [
      { href: '/admin/seo/pages', label: 'Страницы' },
      { href: '/admin/seo/clusters', label: 'Кластеры' },
      { href: '/admin/seo/schema', label: 'Schema' },
      { href: '/admin/seo/experiments', label: 'Эксперименты' },
      { href: '/admin/seo/experts', label: 'Эксперт' },
    ],
  },
]

export function SeoTabs() {
  const path = usePathname()

  return (
    <div style={{ padding: '10px 28px', borderBottom: '1px solid var(--bor)', background: 'var(--surf)' }}>
      {GROUPS.map((g) => (
        <div key={g.title} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', minWidth: 86 }}>
            {g.title}
          </span>
          {g.tabs.map((t) => {
            // «Обзор» живёт на корне раздела, поэтому точное совпадение;
            // у остальных — вложенные экраны вроде /articles/15
            const active = t.href === '/admin/seo' ? path === t.href : path.startsWith(t.href)
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
