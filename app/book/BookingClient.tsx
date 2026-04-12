'use client'

import { useState } from 'react'
import { createBooking } from './actions'

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

interface AvailableSlot {
  date: string
  start_time: string
  end_time: string
  count: number
}

interface Props {
  availableSlots: AvailableSlot[]
}

function endTime(start: string) {
  const [h, m] = start.split(':').map(Number)
  const total = h * 60 + m + 30
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function BookingClient({ availableSlots }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [bookingId, setBookingId] = useState<string | null>(null)

  const now = new Date()
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [viewYear, setViewYear] = useState(now.getFullYear())

  const datesWithSlots = new Set(availableSlots.map(s => s.date))
  const dateSlots = selectedDate
    ? availableSlots.filter(s => s.date === selectedDate).sort((a, b) => a.start_time.localeCompare(b.start_time))
    : []

  // Calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1)
  const lastDay = new Date(viewYear, viewMonth + 1, 0)
  const startDow = (firstDay.getDay() + 6) % 7
  const daysInMonth = lastDay.getDate()
  const todayStr = now.toISOString().split('T')[0]

  const weeks: (number | null)[][] = []
  let week: (number | null)[] = Array(startDow).fill(null)
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d)
    if (week.length === 7) { weeks.push(week); week = [] }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }

  function shiftMonth(dir: number) {
    let m = viewMonth + dir, y = viewYear
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setViewMonth(m); setViewYear(y)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedDate || !selectedTime) return
    setLoading(true); setError('')
    const fd = new FormData(e.currentTarget)
    fd.append('date', selectedDate)
    fd.append('start_time', selectedTime)
    fd.append('end_time', endTime(selectedTime))
    const res = await createBooking(fd)
    setLoading(false)
    if (res.error) setError(res.error)
    else setBookingId(res.bookingId || 'ok')
  }

  // Confirmation screen
  if (bookingId) {
    const cancelUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/book/cancel?id=${bookingId}`
      : ''

    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 400, width: '100%' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(52,199,89,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" width="32" height="32"><polyline points="5,12 10,17 19,7" /></svg>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Вы записаны!</div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 4 }}>
            {selectedDate && new Date(selectedDate + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--purple)', marginBottom: 24 }}>
            {selectedTime}–{selectedTime ? endTime(selectedTime) : ''}
          </div>
          <div style={{
            background: 'rgba(255,255,255,.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,.45)', borderRadius: 16, padding: '16px 20px', marginBottom: 20, textAlign: 'left'
          }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Сохраните эту информацию:</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
              {selectedDate && new Date(selectedDate + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} в {selectedTime}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Наш менеджер свяжется с вами для подтверждения</div>
          </div>
          {bookingId !== 'ok' && (
            <a href={`/book/cancel?id=${bookingId}`}
              style={{ fontSize: 12, color: 'var(--red)', textDecoration: 'none', fontWeight: 500 }}>
              Отменить запись
            </a>
          )}
        </div>
      </div>
    )
  }

  const cardStyle = {
    background: 'rgba(255,255,255,.55)', backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    border: '1px solid rgba(255,255,255,.45)', borderRadius: 20, padding: '20px', marginBottom: 14,
    boxShadow: '0 8px 40px rgba(0,0,0,.06)',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '16px' }}>
      <div style={{ maxWidth: 440, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24, paddingTop: 8 }}>
          <img src="https://i.ibb.co/7tNx07SW/GAS-logo-01.png" alt="Go And Study" style={{ height: 48, objectFit: 'contain', marginBottom: 10 }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Запись на консультацию</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Выберите удобные дату и время</div>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{
              width: s === step ? 32 : 10, height: 10, borderRadius: 20,
              background: step >= s ? 'var(--purple)' : 'var(--bor2)',
              transition: 'all .3s',
            }} />
          ))}
        </div>

        {/* Step 1: Date */}
        {step >= 1 && (
          <div style={{ ...cardStyle, opacity: step === 1 ? 1 : 0.5, pointerEvents: step === 1 ? 'auto' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                {step === 1 ? 'Выберите дату' : new Date(selectedDate + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
              </span>
              {step > 1 && <button onClick={() => { setStep(1); setSelectedTime(null) }} style={{ fontSize: 12, color: 'var(--purple)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>Изменить</button>}
            </div>

            {step === 1 && <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 8 }}>
                <button onClick={() => shiftMonth(-1)} style={{ width: 36, height: 36, border: '1px solid var(--bor2)', borderRadius: 10, background: 'var(--surf)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14"><polyline points="10,4 6,8 10,12" /></svg>
                </button>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{MONTHS[viewMonth]} {viewYear}</span>
                <button onClick={() => shiftMonth(1)} style={{ width: 36, height: 36, border: '1px solid var(--bor2)', borderRadius: 10, background: 'var(--surf)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14"><polyline points="6,4 10,8 6,12" /></svg>
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {WEEKDAYS.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--muted)', padding: '6px 0' }}>{d}</div>
                ))}
                {weeks.flat().map((day, i) => {
                  if (day === null) return <div key={i} />
                  const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const hasSlots = datesWithSlots.has(dateStr)
                  const isPast = dateStr < todayStr
                  const isToday = dateStr === todayStr
                  const isSel = dateStr === selectedDate

                  return (
                    <button key={i} disabled={!hasSlots || isPast}
                      onClick={() => { setSelectedDate(dateStr); setStep(2); setSelectedTime(null) }}
                      style={{
                        width: '100%', aspectRatio: '1', borderRadius: 12, border: 'none',
                        background: isSel ? 'var(--purple)' : hasSlots && !isPast ? 'rgba(177,94,204,.08)' : 'transparent',
                        color: isSel ? '#fff' : isPast || !hasSlots ? 'var(--muted2)' : 'var(--text)',
                        fontWeight: isToday || isSel ? 800 : 500, fontSize: 14,
                        cursor: hasSlots && !isPast ? 'pointer' : 'default',
                        fontFamily: 'inherit', position: 'relative',
                      }}>
                      {day}
                      {hasSlots && !isPast && !isSel && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--purple)', margin: '2px auto 0' }} />}
                    </button>
                  )
                })}
              </div>
            </>}
          </div>
        )}

        {/* Step 2: Time */}
        {step >= 2 && (
          <div style={{ ...cardStyle, opacity: step === 2 ? 1 : 0.5, pointerEvents: step === 2 ? 'auto' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                {step === 2 ? 'Выберите время' : `${selectedTime}–${selectedTime ? endTime(selectedTime) : ''}`}
              </span>
              {step > 2 && <button onClick={() => setStep(2)} style={{ fontSize: 12, color: 'var(--purple)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>Изменить</button>}
            </div>

            {step === 2 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
                {dateSlots.map(slot => {
                  const time = slot.start_time.slice(0, 5)
                  const isSel = time === selectedTime
                  return (
                    <button key={time}
                      onClick={() => { setSelectedTime(time); setStep(3) }}
                      style={{
                        padding: '14px 8px', borderRadius: 12, fontSize: 16, fontWeight: 700,
                        border: isSel ? '2px solid var(--purple)' : '1px solid var(--bor2)',
                        background: isSel ? 'var(--pl)' : 'var(--surf)',
                        color: isSel ? 'var(--purple)' : 'var(--text)',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                      {time}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Contact form */}
        {step === 3 && (
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Ваши данные</div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Имя *</label>
                <input name="client_name" required placeholder="Ваше имя" autoComplete="name"
                  style={{ width: '100%', padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--bor2)', borderRadius: 12, fontSize: 15, color: 'var(--text)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Телефон *</label>
                <input name="client_phone" required placeholder="+7 900 000 00 00" type="tel" autoComplete="tel"
                  style={{ width: '100%', padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--bor2)', borderRadius: 12, fontSize: 15, color: 'var(--text)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Telegram</label>
                <input name="client_telegram" placeholder="@username"
                  style={{ width: '100%', padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--bor2)', borderRadius: 12, fontSize: 15, color: 'var(--text)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              {error && (
                <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(220,53,69,.07)', border: '1px solid rgba(220,53,69,.2)', borderRadius: 10, fontSize: 13, color: 'var(--red)', fontWeight: 500 }}>{error}</div>
              )}

              <button type="submit" disabled={loading}
                style={{ width: '100%', padding: '14px', background: loading ? 'rgba(177,94,204,.5)' : 'var(--purple)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {loading ? 'Записываем...' : 'Записаться'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
