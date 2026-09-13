/**
 * Заглушка на время загрузки страницы админки.
 *
 * Рисует только правую часть: сайдбар живёт в оболочке (`layout.tsx`) и при
 * переходах не перерисовывается. Раньше эта заглушка подменяла собой весь
 * экран вместе с фальшивым сайдбаром — меню на мгновение становилось серым,
 * и переход выглядел как перезагрузка страницы, а не как переход.
 *
 * Полоска сверху — единственное, что здесь по-настоящему нужно: она отвечает
 * на вопрос «нажалось ли». Серые прямоугольники ниже держат высоту, чтобы
 * содержимое не прыгало, когда приедет настоящее.
 */
export default function AdminLoading() {
  return (
    <div className="main">
      <div className="nav-bar" aria-hidden />
      <div className="topbar">
        <div className="skel" style={{ height: 20, width: 140 }} />
      </div>
      <div className="cnt" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 28 }}>
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="skel"
            style={{ height: 56, borderRadius: 12, animationDelay: `${i * 0.08}s` }}
          />
        ))}
      </div>
      <span className="sr-only" role="status">Загружается</span>
    </div>
  )
}
