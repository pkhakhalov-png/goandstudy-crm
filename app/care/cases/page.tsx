/**
 * Клиенты — полный список.
 *
 * Главная показывает только то, что требует внимания; сюда приходят, когда
 * нужен конкретный человек или общая картина.
 */
import { notFound } from 'next/navigation'
import { сессияКонтура } from '@/lib/care/session'
import { списокДел } from '@/lib/care/cases'
import { склонение } from '@/lib/care/labels'
import { CasesTable } from './CasesTable'

export const dynamic = 'force-dynamic'

export default async function СписокДелСтраница() {
  const сессия = await сессияКонтура()
  if (!сессия?.участник) notFound()

  const дела = await списокДел(сессия.участник)

  return (
    <>
      <h1 className="ds-hero-h1" style={{ fontSize: 30, marginBottom: 4 }}>
        Клиенты
      </h1>
      <p style={{ color: 'var(--ds-muted)', marginBottom: 22, fontSize: 14 }}>
        {дела.length === 0
          ? 'Область видимости пуста'
          : `${дела.length} ${склонение(дела.length, 'в работе', 'в работе', 'в работе')}`}
      </p>

      {дела.length === 0 ? (
        <div className="ds-empty">
          <div className="ds-empty-title">Дел пока нет</div>
          <p style={{ fontSize: 14, color: 'var(--ds-muted)', maxWidth: 460, margin: '8px auto 0' }}>
            Это не ошибка доступа. Дела заводятся импортом из действующей CRM —
            <span className="ds-mono"> scripts/care/import-cases.ts</span>.
          </p>
        </div>
      ) : (
        <CasesTable дела={дела} />
      )}
    </>
  )
}
