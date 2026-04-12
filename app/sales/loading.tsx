export default function SalesLoading() {
  return (
    <div className="app">
      {/* Sidebar skeleton */}
      <aside className="sidebar" style={{ opacity: 0.5 }}>
        <div className="lw" style={{ textAlign: 'center', padding: '20px 16px 14px' }}>
          <div style={{ height: 48, width: 120, background: 'var(--bor2)', borderRadius: 8, margin: '0 auto 6px' }} />
          <div style={{ height: 10, width: 80, background: 'var(--bor2)', borderRadius: 4, margin: '0 auto' }} />
        </div>
        <div style={{ padding: '0 12px' }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ height: 36, background: 'var(--bor2)', borderRadius: 8, marginBottom: 4 }} />
          ))}
        </div>
      </aside>

      {/* Content skeleton */}
      <div className="main">
        <div className="topbar">
          <div style={{ height: 20, width: 120, background: 'var(--bor2)', borderRadius: 6 }} />
        </div>
        <div className="cnt" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 28 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{
              height: 56, background: 'var(--surf)', borderRadius: 12,
              border: '1px solid var(--bor)',
              animation: 'pulse 1.5s ease-in-out infinite',
              animationDelay: `${i * 0.1}s`,
            }} />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>
      </div>
    </div>
  )
}
