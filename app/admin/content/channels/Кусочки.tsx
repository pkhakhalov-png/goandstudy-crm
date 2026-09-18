import type { Мера, Состояние } from '@/lib/content/channel-panel'
import { СОСТОЯНИЕ_RU } from '@/lib/content/channel-panel'

const ЦВЕТ: Record<Состояние, string> = {
  работает: 'var(--green)',
  требует_внимания: 'var(--red)',
  нет_публикаций: 'var(--muted)',
  приостановлен: 'var(--muted)',
  выключен: 'var(--red)',
}

/** Состояние канала: точка и слово. Цветом кодируется только то, что требует действия. */
export function Состояние_({ с }: { с: Состояние }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: ЦВЕТ[с] }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: ЦВЕТ[с], display: 'inline-block' }} />
      {СОСТОЯНИЕ_RU[с]}
    </span>
  )
}

export function Метка({ children, тон }: { children: React.ReactNode; тон?: 'обычный' | 'тихий' }) {
  return (
    <span style={{
      fontSize: 11, padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap',
      border: '1px solid var(--bor2)', background: 'var(--surf2)',
      color: тон === 'тихий' ? 'var(--muted)' : 'var(--text)',
    }}>{children}</span>
  )
}

/**
 * Число, которого может не быть.
 *
 * «Нет данных» набрано словами и приглушено, а не нулём: ноль означает «столько
 * и было», и спутать эти два случая — самый дешёвый способ соврать на экране.
 */
export function Числом({ label, мера, suffix }: { label: string; мера: Мера | number; suffix?: string }) {
  const m: Мера = typeof мера === 'number' ? { n: мера } : мера
  return (
    <div style={{ minWidth: 92 }} title={m.почему ?? undefined}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>{label}</div>
      {m.n === null
        ? <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: '26px' }}>нет данных</div>
        : <div style={{ fontSize: 20, fontWeight: 600, lineHeight: '26px' }}>
            {m.n.toLocaleString('ru-RU')}{suffix ? <span style={{ fontSize: 12, color: 'var(--muted)' }}> {suffix}</span> : null}
          </div>}
    </div>
  )
}
