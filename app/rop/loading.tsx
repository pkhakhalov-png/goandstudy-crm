/**
 * Заглушка на время загрузки страницы РОПа. Отличие от админки одно — цвет:
 * у раздела он золотой. Почему с задержкой — в `app/admin/loading.tsx`.
 */
export default function RopLoading() {
  return (
    <div className="main">
      <div className="load" style={{ '--load-accent': 'var(--gold, #c97d00)' } as React.CSSProperties}>
        <span className="load-spin" aria-hidden />
      </div>
      <span className="sr-only" role="status">Загружается</span>
    </div>
  )
}
