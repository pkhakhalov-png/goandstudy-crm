'use client'

import { plural } from './plural'

// Простой клиентский пагинатор для длинных списков в админке.
// Данные уже загружены — режем массив на клиенте.

export function Pager({ page, pageCount, onPage, total, unit = ['запись', 'записи', 'записей'] }: {
  page: number
  pageCount: number
  onPage: (p: number) => void
  total?: number
  unit?: [string, string, string]
}) {
  if (pageCount <= 1) return null
  const btn = (disabled: boolean): React.CSSProperties => ({
    width: 30, height: 30, border: '1px solid var(--bor2)', borderRadius: 8, background: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, padding: 0,
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '14px 0 4px' }}>
      <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} style={btn(page <= 1)} aria-label="Назад">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="12" height="12"><polyline points="10,4 6,8 10,12" /></svg>
      </button>
      <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, minWidth: 120, textAlign: 'center' }}>
        Стр. {page} из {pageCount}{typeof total === 'number' ? ` · ${plural(total, unit)}` : ''}
      </span>
      <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pageCount} style={btn(page >= pageCount)} aria-label="Вперёд">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="12" height="12"><polyline points="6,4 10,8 6,12" /></svg>
      </button>
    </div>
  )
}

// Число страниц для длины массива и размера страницы.
export function pageCountOf(length: number, size: number): number {
  return Math.max(1, Math.ceil(length / size))
}
