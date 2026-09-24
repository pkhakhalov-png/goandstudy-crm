'use client'

/**
 * «Отметьте, чем закончилась консультация».
 *
 * Появляется, когда время слота прошло, а статус брони так и остался
 * «подтверждена». Это единственное место, где показатель «дошёл до
 * консультации» вообще может появиться: больше его взять неоткуда.
 *
 * Блок намеренно стоит выше задач и списка клиентов и не сворачивается, пока
 * в нём что-то есть. Спрятать его под вкладку значит вернуться к тому, с чего
 * начали: 35 броней из 157 висят неотмеченными, и никто этого не видит.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { markBookingOutcome } from './actions'

type Booking = {
  id: string
  booking_date: string
  start_time: string
  end_time: string
  client_name: string
  client_phone: string | null
}

const ИСХОДЫ: { код: string; ярлык: string; цвет: string }[] = [
  { код: 'completed', ярлык: 'Состоялась',  цвет: 'var(--green)' },
  { код: 'no_show',   ярлык: 'Не пришёл',   цвет: 'var(--red)' },
  { код: 'cancelled', ярлык: 'Отменилась',  цвет: 'var(--muted)' },
]

export function PendingOutcomePanel({ bookings }: { bookings: Booking[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  // Какую бронь сейчас отмечаем — чтобы блокировать только её кнопки,
  // а не весь список: отмечают обычно несколько подряд.
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (bookings.length === 0) return null

  async function отметить(bookingId: string, outcome: string) {
    setBusy(bookingId)
    setError(null)
    const fd = new FormData()
    fd.append('booking_id', bookingId)
    fd.append('outcome', outcome)
    const res = await markBookingOutcome(fd)
    setBusy(null)
    if (res?.error) { setError(res.error); return }
    startTransition(() => router.refresh())
  }

  return (
    <div style={{ padding: '12px 24px 0' }}>
      <div style={{
        background: 'rgba(201,125,0,.05)', border: '1px solid rgba(201,125,0,.2)',
        borderRadius: 14, padding: '14px 18px',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--gold)', marginBottom: 4 }}>
          Отметьте исход консультации ({bookings.length})
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
          Время прошло, а чем закончилось — не отмечено. Пока не отметите, встреча не попадёт в статистику.
        </div>

        {error && (
          <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>{error}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {bookings.map(b => {
            const дата = new Date(b.booking_date + 'T12:00:00.000Z')
              .toLocaleDateString('ru', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' })
            const занято = busy === b.id || pending
            return (
              <div key={b.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                borderRadius: 10, background: 'rgba(201,125,0,.06)',
                border: '1px solid rgba(201,125,0,.15)', opacity: занято ? 0.55 : 1,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{b.client_name}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                    {дата} · {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}
                    {b.client_phone ? ` · ${b.client_phone}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {ИСХОДЫ.map(и => (
                    <button
                      key={и.код}
                      disabled={занято}
                      onClick={() => отметить(b.id, и.код)}
                      style={{
                        padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 8,
                        cursor: занято ? 'default' : 'pointer', fontFamily: 'inherit',
                        background: 'transparent', color: и.цвет,
                        border: `1px solid ${и.цвет}`,
                      }}>
                      {и.ярлык}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
