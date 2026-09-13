/**
 * Заглушка на время загрузки страницы раздела РОПа.
 * Рисует только правую часть: сайдбар живёт в оболочке и не перерисовывается.
 */
export default function RopLoading() {
  return (
    <div className="main">
      <div className="nav-bar" aria-hidden />
      <div className="topbar">
        <div className="skel" style={{ height: 20, width: 140 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '20px 24px' }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skel" style={{ height: 56, borderRadius: 12, animationDelay: `${i * 0.08}s` }} />
        ))}
      </div>
      <span className="sr-only" role="status">Загружается</span>
    </div>
  )
}
