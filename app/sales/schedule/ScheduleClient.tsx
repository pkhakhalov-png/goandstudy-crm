'use client'

import { useState } from 'react'
import { saveWeekSlots, updateBookingStatus } from './actions'

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const HOURS_START = 9
const HOURS_END = 23
const SLOT_MINUTES = 30

function generateTimeSlots() {
  const slots: string[] = []
  for (let h = HOURS_START; h < HOURS_END; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`)
    slots.push(`${String(h).padStart(2, '0')}:30`)
  }
  return slots
}

function endTime(start: string) {
  const [h, m] = start.split(':').map(Number)
  const total = h * 60 + m + SLOT_MINUTES
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const TIME_SLOTS = generateTimeSlots()

interface Props {
  slots: { day_of_week: number; start_time: string }[]
  bookings: any[]
  allStats: { id: string; status: string; booking_date: string }[]
  userId: string
}

const statusLabel: Record<string, string> = { confirmed: 'Подтверждена', completed: 'Проведена', cancelled: 'Отменена', no_show: 'Не пришёл' }
const statusCls: Record<string, string> = { confirmed: 'ps', completed: 'pa', cancelled: 'po', no_show: 'po' }

const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

export function ScheduleClient({ slots: initialSlots, bookings, allStats, userId }: Props) {
  const [linkCopied, setLinkCopied] = useState(false)

  function copyBookingLink() {
    const url = `${window.location.origin}/book/${userId}`
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 3000)
    })
  }
  const [activeSlots, setActiveSlots] = useState<Set<string>>(() => {
    const set = new Set<string>()
    initialSlots.forEach(s => {
      const time = s.start_time.slice(0, 5)
      set.add(`${s.day_of_week}-${time}`)
    })
    return set
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragMode, setDragMode] = useState<'add' | 'remove'>('add')
  const [gridOpen, setGridOpen] = useState(false)

  function toggleSlot(day: number, time: string) {
    const key = `${day}-${time}`
    setActiveSlots(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setSaved(false)
  }

  function handleMouseDown(day: number, time: string) {
    const key = `${day}-${time}`
    setIsDragging(true)
    setDragMode(activeSlots.has(key) ? 'remove' : 'add')
    toggleSlot(day, time)
  }

  function handleMouseEnter(day: number, time: string) {
    if (!isDragging) return
    const key = `${day}-${time}`
    setActiveSlots(prev => {
      const next = new Set(prev)
      if (dragMode === 'add') next.add(key)
      else next.delete(key)
      return next
    })
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    const slotsArr = Array.from(activeSlots).map(key => {
      const [day, time] = key.split('-')
      return { day_of_week: Number(day), start_time: time + ':00', end_time: endTime(time) + ':00' }
    })
    const fd = new FormData()
    fd.append('slots', JSON.stringify(slotsArr))
    await saveWeekSlots(fd)
    setSaving(false)
    setSaved(true)
  }

  async function handleStatus(bookingId: string, status: string) {
    const fd = new FormData()
    fd.append('booking_id', bookingId)
    fd.append('status', status)
    await updateBookingStatus(fd)
  }

  function fillDay(day: number) {
    setActiveSlots(prev => {
      const next = new Set(prev)
      TIME_SLOTS.forEach(t => next.add(`${day}-${t}`))
      return next
    })
    setSaved(false)
  }

  function clearDay(day: number) {
    setActiveSlots(prev => {
      const next = new Set(prev)
      TIME_SLOTS.forEach(t => next.delete(`${day}-${t}`))
      return next
    })
    setSaved(false)
  }

  const [bookingTab, setBookingTab] = useState<'upcoming' | 'today' | 'archive'>('upcoming')

  // Categorize bookings
  const today = new Date().toISOString().split('T')[0]
  const nowTime = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`

  // Today: all bookings for today (including cancelled — they "burn")
  const todayBookings = bookings.filter(b => b.booking_date === today)
    .sort((a: any, b: any) => a.start_time.localeCompare(b.start_time))
  // Upcoming: future bookings (including cancelled — visible until date passes)
  const upcoming = bookings.filter(b => b.booking_date > today)
    .sort((a: any, b: any) => `${a.booking_date}${a.start_time}`.localeCompare(`${b.booking_date}${b.start_time}`))
  // Archive: only past dates
  const archive = bookings.filter(b => b.booking_date < today)
    .sort((a: any, b: any) => `${b.booking_date}${b.start_time}`.localeCompare(`${a.booking_date}${a.start_time}`))

  // Stats from ALL bookings (not limited to 30 days)
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  const monthStats = allStats.filter(b => {
    const d = new Date(b.booking_date)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })
  const monthCompleted = monthStats.filter(b => b.status === 'completed').length
  const monthNoShow = monthStats.filter(b => b.status === 'no_show').length
  const monthCancelled = monthStats.filter(b => b.status === 'cancelled').length
  const monthTotal = monthStats.length

  const totalCompleted = allStats.filter(b => b.status === 'completed').length
  const totalAll = allStats.length

  return (
    <>
      {/* Personal booking link */}
      <div style={{ padding: '0 24px', marginBottom: 14 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          background: 'rgba(177,94,204,.06)', border: '1px solid rgba(177,94,204,.15)',
          borderRadius: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Моя ссылка для записи</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Отправьте клиенту — он запишется именно к вам</div>
          </div>
          <button onClick={copyBookingLink}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: linkCopied ? 'rgba(22,163,97,.1)' : 'var(--purple)',
              color: linkCopied ? 'var(--green)' : '#fff',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all .15s',
            }}>
            {linkCopied ? 'Скопировано!' : 'Копировать ссылку'}
          </button>
        </div>
      </div>

      {/* KPI row 1 — оперативные */}
      <div className="kw">
        <div className="kg k4">
          <div className="kc" onClick={() => setBookingTab('today')} style={{ cursor: 'pointer' }}>
            <div className="kl">Сегодня</div>
            <div className="kv o" style={{ fontSize: 17 }}>{todayBookings.length}</div>
            <div className="ks">записей</div>
          </div>
          <div className="kc" onClick={() => setBookingTab('upcoming')} style={{ cursor: 'pointer' }}>
            <div className="kl">Предстоящие</div>
            <div className="kv p" style={{ fontSize: 17 }}>{upcoming.length}</div>
            <div className="ks">записей</div>
          </div>
          <div className="kc">
            <div className="kl">Слотов</div>
            <div className="kv" style={{ fontSize: 17 }}>{activeSlots.size}</div>
            <div className="ks">{(activeSlots.size * 0.5).toFixed(1)} ч/нед</div>
          </div>
          <div className="kc">
            <div className="kl">Всего проведено</div>
            <div className="kv g" style={{ fontSize: 17 }}>{totalCompleted}</div>
            <div className="ks">из {totalAll} записей</div>
          </div>
        </div>

        {/* KPI row 2 — месячная статистика */}
        <div style={{ background: 'var(--surf)', border: '1px solid var(--bor)', borderRadius: 16, padding: '14px 20px', boxShadow: 'var(--sh)', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{MONTH_NAMES[currentMonth]} {currentYear}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Всего записей: {monthTotal}</span>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1, textAlign: 'center', padding: '8px 0', background: 'rgba(52,199,89,.06)', borderRadius: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{monthCompleted}</div>
              <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600, marginTop: 2 }}>Проведено</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: '8px 0', background: 'rgba(255,149,0,.06)', borderRadius: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold)' }}>{monthNoShow}</div>
              <div style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 600, marginTop: 2 }}>Не пришли</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: '8px 0', background: 'rgba(255,59,48,.06)', borderRadius: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--red)' }}>{monthCancelled}</div>
              <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 600, marginTop: 2 }}>Отмены</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: '8px 0', background: 'rgba(177,94,204,.06)', borderRadius: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--purple)' }}>{monthTotal > 0 ? Math.round(monthCompleted / monthTotal * 100) : 0}%</div>
              <div style={{ fontSize: 10, color: 'var(--purple)', fontWeight: 600, marginTop: 2 }}>Конверсия</div>
            </div>
          </div>
        </div>
      </div>

      <div className="cnt">
        {/* Schedule grid */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button onClick={() => setGridOpen(!gridOpen)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 18px', borderRadius: 12,
              background: gridOpen ? 'var(--pl)' : 'var(--surf)',
              border: `1px solid ${gridOpen ? 'var(--pb)' : 'var(--bor2)'}`,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all .2s',
            }}>
            <svg viewBox="0 0 10 10" fill="none" stroke={gridOpen ? 'var(--purple)' : 'var(--text)'} strokeWidth="2" width="12" height="12"
              style={{ transform: gridOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
              <polyline points="3,2 7,5 3,8" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: gridOpen ? 'var(--purple)' : 'var(--text)' }}>
              {gridOpen ? 'Свернуть расписание' : 'Настроить расписание'}
            </span>
            {!gridOpen && <span style={{ fontSize: 12, color: 'var(--purple)', fontWeight: 700, background: 'var(--pl)', padding: '2px 8px', borderRadius: 6 }}>{activeSlots.size} слотов</span>}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {gridOpen && (
              <button onClick={handleSave} disabled={saving} className="btn-p" style={{ opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Сохраняю...' : saved ? 'Сохранено ✓' : 'Сохранить расписание'}
              </button>
            )}
          </div>
        </div>

        <div style={{
          background: 'var(--surf)', border: '1px solid var(--bor)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--sh)', marginBottom: 24,
          maxHeight: gridOpen ? '2000px' : '0', opacity: gridOpen ? 1 : 0,
          transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease',
        }}
          onMouseUp={() => setIsDragging(false)} onMouseLeave={() => setIsDragging(false)}>

          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', borderBottom: '1px solid var(--bor2)' }}>
            <div style={{ padding: 8 }} />
            {DAYS.map((day, i) => (
              <div key={i} style={{ padding: '8px 4px', textAlign: 'center', borderLeft: '1px solid var(--bor2)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{day}</div>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                  <button onClick={() => fillDay(i)} style={{ fontSize: 9, color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Всё</button>
                  <button onClick={() => clearDay(i)} style={{ fontSize: 9, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Очист.</button>
                </div>
              </div>
            ))}
          </div>

          {/* Time rows */}
          {TIME_SLOTS.map(time => (
            <div key={time} style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', borderBottom: '1px solid rgba(0,0,0,.02)' }}>
              <div style={{ padding: '4px 8px', fontSize: 10, color: 'var(--muted)', fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{time}</div>
              {DAYS.map((_, day) => {
                const key = `${day}-${time}`
                const isActive = activeSlots.has(key)
                // Check if there's a booking at this slot for today's day of week
                const todayDow = (new Date().getDay() + 6) % 7
                const isBooked = day === todayDow && upcoming.some(b => b.start_time.slice(0, 5) === time && b.booking_date === today)

                return (
                  <div key={day}
                    onMouseDown={() => handleMouseDown(day, time)}
                    onMouseEnter={() => handleMouseEnter(day, time)}
                    style={{
                      padding: 3, borderLeft: '1px solid rgba(0,0,0,.03)',
                      cursor: 'pointer', userSelect: 'none',
                    }}>
                    <div style={{
                      height: 22, borderRadius: 5,
                      background: isBooked ? 'rgba(255,149,0,.15)' : isActive ? 'rgba(52,199,89,.12)' : 'transparent',
                      border: isBooked ? '1px solid rgba(255,149,0,.3)' : isActive ? '1px solid rgba(52,199,89,.25)' : '1px solid transparent',
                      transition: 'all .1s',
                    }} />
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Booking tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 14, background: 'var(--surf)', border: '1px solid var(--bor)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--sh)' }}>
          {([
            ['today', `Сегодня (${todayBookings.length})`, todayBookings.length > 0],
            ['upcoming', `Предстоящие (${upcoming.length})`, false],
            ['archive', `Архив (${archive.length})`, false],
          ] as const).map(([key, label, hasUrgent]) => (
            <button key={key} onClick={() => setBookingTab(key)}
              style={{
                flex: 1, padding: '11px 16px', fontSize: 12, fontWeight: bookingTab === key ? 700 : 500,
                color: bookingTab === key ? 'var(--purple)' : 'var(--muted)',
                background: bookingTab === key ? 'var(--pl)' : 'transparent',
                border: 'none', borderBottom: bookingTab === key ? '2px solid var(--purple)' : '2px solid transparent',
                cursor: 'pointer', fontFamily: 'inherit',
                position: 'relative',
              }}>
              {label}
              {hasUrgent && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', marginLeft: 6, verticalAlign: 'middle' }} />}
            </button>
          ))}
        </div>

        {/* Today */}
        {bookingTab === 'today' && (
          todayBookings.length === 0
            ? <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 32, fontSize: 12 }}>Сегодня записей нет</div>
            : <div style={{ display: 'grid', gap: 8 }}>
                {todayBookings.map((b: any) => {
                  const isCancelled = b.status === 'cancelled'
                  return (
                    <div key={b.id} style={{
                      background: isCancelled ? 'rgba(255,59,48,.04)' : 'var(--surf)',
                      border: isCancelled ? '1px solid rgba(255,59,48,.25)' : '1px solid var(--bor)',
                      borderRadius: 14, padding: '14px 18px',
                      boxShadow: 'var(--sh)',
                      borderLeft: isCancelled ? '3px solid var(--red)' : '3px solid var(--gold)',
                    }}>
                      {isCancelled && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', background: 'rgba(255,59,48,.08)', padding: '4px 10px', borderRadius: 6, marginBottom: 8, display: 'inline-block' }}>
                          КЛИЕНТ ОТМЕНИЛ ЗАПИСЬ
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: isCancelled ? 'var(--muted)' : 'var(--text)', textDecoration: isCancelled ? 'line-through' : 'none' }}>{b.client_name}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: isCancelled ? 'var(--red)' : 'var(--gold)', marginTop: 2 }}>
                            {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}
                          </div>
                        </div>
                        <span className={`pill ${statusCls[b.status] || 'pw'}`}><span className="dot"></span>{statusLabel[b.status] || b.status}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, marginBottom: 8 }}>
                        {b.client_phone && <a href={`tel:${b.client_phone}`} style={{ color: 'var(--purple)', textDecoration: 'none', fontWeight: 600 }}>{b.client_phone}</a>}
                        {b.client_telegram && <a href={`https://t.me/${b.client_telegram.replace('@', '')}`} target="_blank" rel="noopener" style={{ color: 'var(--purple)', textDecoration: 'none' }}>TG: {b.client_telegram}</a>}
                      </div>
                      {b.status === 'confirmed' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => handleStatus(b.id, 'completed')} className="btn-s" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--green)', borderColor: 'rgba(52,199,89,.2)' }}>Проведена</button>
                          <button onClick={() => handleStatus(b.id, 'no_show')} className="btn-s" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--gold)', borderColor: 'rgba(255,149,0,.2)' }}>Не пришёл</button>
                          <button onClick={() => handleStatus(b.id, 'cancelled')} className="btn-s" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--red)', borderColor: 'rgba(220,53,69,.2)' }}>Отменить</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
        )}

        {/* Upcoming */}
        {bookingTab === 'upcoming' && (
          upcoming.length === 0
            ? <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 32, fontSize: 12 }}>Предстоящих записей нет</div>
            : <div style={{ display: 'grid', gap: 8 }}>
                {upcoming.map((b: any) => {
                  const isCancelled = b.status === 'cancelled'
                  return (
                    <div key={b.id} style={{
                      background: isCancelled ? 'rgba(255,59,48,.04)' : 'var(--surf)',
                      border: isCancelled ? '1px solid rgba(255,59,48,.25)' : '1px solid var(--bor)',
                      borderRadius: 14, padding: '14px 18px',
                      boxShadow: 'var(--sh)',
                      borderLeft: isCancelled ? '3px solid var(--red)' : '3px solid var(--purple)',
                    }}>
                      {isCancelled && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', background: 'rgba(255,59,48,.08)', padding: '4px 10px', borderRadius: 6, marginBottom: 8, display: 'inline-block' }}>
                          КЛИЕНТ ОТМЕНИЛ ЗАПИСЬ
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: isCancelled ? 'var(--muted)' : 'var(--text)', textDecoration: isCancelled ? 'line-through' : 'none' }}>{b.client_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                            {new Date(b.booking_date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' })} · {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}
                          </div>
                        </div>
                        <span className={`pill ${statusCls[b.status] || 'pw'}`}><span className="dot"></span>{statusLabel[b.status] || b.status}</span>
                      </div>
                      {!isCancelled && (
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, marginBottom: 8 }}>
                          {b.client_phone && <a href={`tel:${b.client_phone}`} style={{ color: 'var(--purple)', textDecoration: 'none', fontWeight: 600 }}>{b.client_phone}</a>}
                          {b.client_telegram && <a href={`https://t.me/${b.client_telegram.replace('@', '')}`} target="_blank" rel="noopener" style={{ color: 'var(--purple)', textDecoration: 'none' }}>TG: {b.client_telegram}</a>}
                        </div>
                      )}
                      {b.status === 'confirmed' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => handleStatus(b.id, 'completed')} className="btn-s" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--green)', borderColor: 'rgba(52,199,89,.2)' }}>Проведена</button>
                          <button onClick={() => handleStatus(b.id, 'no_show')} className="btn-s" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--gold)', borderColor: 'rgba(255,149,0,.2)' }}>Не пришёл</button>
                          <button onClick={() => handleStatus(b.id, 'cancelled')} className="btn-s" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--red)', borderColor: 'rgba(220,53,69,.2)' }}>Отменить</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
        )}

        {/* Archive */}
        {bookingTab === 'archive' && (
          archive.length === 0
            ? <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 32, fontSize: 12 }}>Архив пуст</div>
            : <div style={{ display: 'grid', gap: 6 }}>
                {archive.map((b: any) => (
                  <div key={b.id} style={{ background: 'var(--surf2)', border: '1px solid var(--bor2)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.7 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{b.client_name}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>
                          {new Date(b.booking_date + 'T00:00:00').toLocaleDateString('ru-RU')} · {b.start_time.slice(0, 5)}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {b.client_phone && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{b.client_phone}</span>}
                      <span className={`pill ${statusCls[b.status] || 'pw'}`} style={{ fontSize: 9 }}><span className="dot"></span>{statusLabel[b.status] || b.status}</span>
                    </div>
                  </div>
                ))}
              </div>
        )}
      </div>
    </>
  )
}
