import { C } from '../lib/theme'

// Показывается, если RPC ещё не создан (миграция не применена).
export function DbNotice({ message }: { message: string }) {
  return (
    <div style={{ background: C.warnBg, border: `1px solid ${C.warn2}`, borderRadius: 14, padding: '20px 24px', color: C.warnText }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Аналитический слой ещё не применён</div>
      <div style={{ fontSize: 13, lineHeight: 1.5 }}>
        Примените миграцию <code>supabase/migrations/20260806000000_analytics_foundation.sql</code> в Supabase SQL Editor,
        затем обновите страницу.
      </div>
      <div style={{ fontSize: 12, marginTop: 8, opacity: .8 }}>Детали: {message}</div>
    </div>
  )
}
