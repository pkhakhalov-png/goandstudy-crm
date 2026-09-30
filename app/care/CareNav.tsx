'use client'

/**
 * Навигация кабинета. Раздел 3.4 дизайн-документа.
 *
 * Клиентский компонент только ради подсветки текущего раздела: серверный
 * не знает, где пользователь, а подсказывать это пропсами из каждой
 * страницы значит заводить место, где однажды забудут.
 *
 * Бейдж «На проверку» — единственное место в сайдбаре с цветом. Серый —
 * обычные, amber — есть срочные, красный — есть просроченные.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type ПунктМеню = {
  href: string
  подпись: string
  бейдж?: number
  уровень?: 'обычный' | 'amber' | 'error'
  разделитель?: boolean
}

export function CareNav({ пункты }: { пункты: ПунктМеню[] }) {
  const путь = usePathname()

  return (
    <>
      {пункты.map((п) =>
        п.разделитель ? (
          <div key={`sep-${п.href}`} className="care-nav-sep" />
        ) : (
          <Link
            key={п.href}
            href={п.href}
            className="care-nav-item"
            // Точное совпадение для корня, префикс для остальных: иначе
            // «Главная» подсвечивалась бы на каждой странице кабинета.
            data-active={п.href === '/care' ? путь === '/care' : путь.startsWith(п.href)}
          >
            {п.подпись}
            {п.бейдж !== undefined && п.бейдж > 0 && (
              <span className="care-nav-badge" data-level={п.уровень ?? 'обычный'}>
                {п.бейдж}
              </span>
            )}
          </Link>
        )
      )}
    </>
  )
}
