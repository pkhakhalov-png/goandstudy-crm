'use client'

import { useState } from 'react'
import { cancelBooking } from './actions'

interface Props {
  booking: { id: string; booking_date: string; start_time: string; end_time: string; client_name: string; status: string }
}

export function CancelClient({ booking }: Props) {
  const [cancelled, setCancelled] = useState(booking.status === 'cancelled')
  const [loading, setLoading] = useState(false)

  async function handleCancel() {
    setLoading(true)
    await cancelBooking(booking.id)
    setCancelled(true)
    setLoading(false)
  }

  if (cancelled) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Запись отменена</div>
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>
            {booking.client_name}, ваша запись на {new Date(booking.booking_date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} в {booking.start_time.slice(0, 5)} отменена.
          </div>
          <a href="/book" style={{ display: 'inline-block', marginTop: 20, padding: '12px 24px', background: 'var(--purple)', color: '#fff', borderRadius: 12, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
            Записаться снова
          </a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ textAlign: 'center', maxWidth: 400, width: '100%' }}>
        <img src="https://i.ibb.co/7tNx07SW/GAS-logo-01.png" alt="Go And Study" style={{ height: 48, objectFit: 'contain', marginBottom: 16 }} />
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Отмена записи</div>

        <div style={{
          background: 'rgba(255,255,255,.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,.45)', borderRadius: 16, padding: '20px', marginBottom: 20, textAlign: 'left'
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{booking.client_name}</div>
          <div style={{ fontSize: 14, color: 'var(--text)' }}>
            {new Date(booking.booking_date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--purple)', marginTop: 4 }}>
            {booking.start_time.slice(0, 5)}–{booking.end_time.slice(0, 5)}
          </div>
        </div>

        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>Вы уверены что хотите отменить запись?</div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={handleCancel} disabled={loading}
            style={{ padding: '12px 24px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Отменяем...' : 'Да, отменить'}
          </button>
          <a href="/book" style={{ padding: '12px 24px', background: 'var(--surf)', border: '1px solid var(--bor2)', borderRadius: 12, fontSize: 14, fontWeight: 500, color: 'var(--muted)', textDecoration: 'none' }}>
            Назад
          </a>
        </div>
      </div>
    </div>
  )
}
