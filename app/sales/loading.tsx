/**
 * Заглушка на время загрузки страницы продажника: то же, что в админке,
 * зелёным. Почему с задержкой — в `app/admin/loading.tsx`.
 */
export default function SalesLoading() {
  return (
    <div className="main">
      <div className="load" style={{ '--load-accent': 'var(--green)' } as React.CSSProperties}>
        <span className="load-spin" aria-hidden />
      </div>
      <span className="sr-only" role="status">Загружается</span>
    </div>
  )
}
