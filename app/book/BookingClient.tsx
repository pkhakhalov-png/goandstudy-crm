'use client'

import { useState } from 'react'
import { createBooking } from './actions'

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

interface AvailableSlot { date: string; start_time: string; end_time: string; count: number }
interface Props { availableSlots: AvailableSlot[] }

function endTime(start: string) {
  const [h, m] = start.split(':').map(Number)
  const total = h * 60 + m + 30
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const QUIZ_STEPS = [
  { id: 'contacts', title: 'Оставьте заявку и мы запишем вас на бесплатную консультацию', type: 'contacts' as const },
  { id: 'age', title: 'Ваш возраст?', type: 'slider' as const, min: 15, max: 40, defaultValue: 25 },
  { id: 'status', title: 'Подскажите ваш статус?', type: 'radio' as const, options: ['Учусь в школе / колледже', 'Учусь в университете / работаю', 'Родитель'] },
  { id: 'budget', title: 'Каким примерным бюджетом на обучение в год вы располагаете?', type: 'radio' as const, options: ['€2,500', '€2,500 – €5,000', '€5,000 – €10,000', '€10,000 +'], lowBudgetRedirect: true },
  { id: 'about', title: 'Расскажите немного о себе (почему решили получить зарубежное образование?)', type: 'textarea' as const },
  { id: 'degree', title: 'Какая вас интересует степень обучения?', type: 'radio' as const, options: ['Подготовительная программа (Foundation)', 'Бакалавр', 'Магистр', 'PhD', 'Языковые курсы / короткие профильные программы'] },
  { id: 'format', title: 'Формат обучения?', type: 'radio' as const, options: ['На кампусе', 'Дистанционно'] },
  { id: 'country', title: 'Какая страна вас интересует?', type: 'text' as const, placeholder: 'Введите страну...' },
  { id: 'year', title: 'В каком году планируете обучение?', type: 'radio' as const, options: ['В 2026 / 2027', 'В 2027 / 2028'] },
  { id: 'stage', title: 'На каком вы сейчас этапе?', type: 'checkbox' as const, hint: '*Отметьте один или несколько вариантов', options: ['Знаю в какие страны хочу поступить', 'Знаю на кого хочу учиться', 'Знаю ВУЗы, которые мне интересны', 'Была консультация в других компаниях', 'Только начинаю изучать информацию', 'Свой вариант'] },
  { id: 'result', title: 'Какой результат вы хотели бы получить от работы с нами?', type: 'textarea' as const },
  { id: 'consultation_format', title: 'В каком формате вам было бы удобнее провести консультацию?', type: 'radio' as const, options: ['Аудио/Видео звонок', 'Переписка в мессенджере'], showConsultant: true, consultantNote: 'ВАЖНО: Время записи: московское (МСК)', isFinal: true },
]

const TOTAL_STEPS = QUIZ_STEPS.length + 2

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,.55)', backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  border: '1px solid rgba(255,255,255,.45)', borderRadius: 20, padding: '28px 32px',
  boxShadow: '0 8px 40px rgba(0,0,0,.06)', minHeight: 360, display: 'flex', flexDirection: 'column' as const,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '14px 16px', background: 'var(--bg)',
  border: '1px solid var(--bor2)', borderRadius: 12, fontSize: 15,
  color: 'var(--text)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}

export function BookingClient({ availableSlots }: Props) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [tgRedirect, setTgRedirect] = useState(false)
  const [customVariant, setCustomVariant] = useState('')

  const now = new Date()
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)

  const datesWithSlots = new Set(availableSlots.map(s => s.date))
  const dateSlots = selectedDate ? availableSlots.filter(s => s.date === selectedDate).sort((a, b) => a.start_time.localeCompare(b.start_time)) : []
  const todayStr = now.toISOString().split('T')[0]

  const firstDay = new Date(viewYear, viewMonth, 1)
  const lastDay = new Date(viewYear, viewMonth + 1, 0)
  const startDow = (firstDay.getDay() + 6) % 7
  const weeks: (number | null)[][] = []
  let week: (number | null)[] = Array(startDow).fill(null)
  for (let d = 1; d <= lastDay.getDate(); d++) {
    week.push(d)
    if (week.length === 7) { weeks.push(week); week = [] }
  }
  if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week) }

  function shiftMonth(dir: number) {
    let m = viewMonth + dir, y = viewYear
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setViewMonth(m); setViewYear(y)
  }

  function setAnswer(key: string, value: any) { setAnswers(prev => ({ ...prev, [key]: value })) }

  function toggleCheckbox(key: string, value: string) {
    setAnswers(prev => {
      const arr = prev[key] || []
      return { ...prev, [key]: arr.includes(value) ? arr.filter((v: string) => v !== value) : [...arr, value] }
    })
  }

  function handleRadioSelect(id: string, value: string) {
    setAnswer(id, value)
    const q = QUIZ_STEPS[step] as any

    // Budget €2,500 → redirect to TG
    if (q.lowBudgetRedirect && value === '€2,500') {
      setTgRedirect(true)
      return
    }

    // Auto-advance for radio (except final step)
    if (!q.isFinal) {
      setTimeout(() => { setError(''); setStep(step + 1) }, 300)
    }
  }

  const isQuizStep = step < QUIZ_STEPS.length
  const isDateStep = step === QUIZ_STEPS.length
  const isTimeStep = step === QUIZ_STEPS.length + 1
  const progress = ((step + 1) / TOTAL_STEPS) * 100

  function canProceed() {
    if (isQuizStep) {
      const q = QUIZ_STEPS[step]
      if (q.id === 'contacts') return answers.client_name?.trim() && answers.client_phone?.trim()
      if (q.type === 'radio') return !!answers[q.id]
      if (q.type === 'checkbox') {
        const arr = answers[q.id] || []
        if (arr.length === 0) return false
        if (arr.includes('Свой вариант') && !customVariant.trim()) return false
        return true
      }
      if (q.type === 'textarea') return !!(answers[q.id] || '').trim()
      if (q.type === 'text') return !!(answers[q.id] || '').trim()
      return true
    }
    if (isDateStep) return !!selectedDate
    if (isTimeStep) return !!selectedTime
    return false
  }

  async function handleSubmit() {
    if (!selectedDate || !selectedTime) return
    setLoading(true); setError('')
    const fd = new FormData()
    fd.append('date', selectedDate)
    fd.append('start_time', selectedTime)
    fd.append('end_time', endTime(selectedTime))
    fd.append('client_name', answers.client_name || '')
    fd.append('client_phone', answers.client_phone || '')
    fd.append('client_telegram', answers.client_telegram || '')
    // Include custom variant in stage answers
    const finalAnswers = { ...answers }
    if (customVariant && (finalAnswers.stage || []).includes('Свой вариант')) {
      finalAnswers.stage = finalAnswers.stage.map((v: string) => v === 'Свой вариант' ? `Свой вариант: ${customVariant}` : v)
    }
    fd.append('quiz_data', JSON.stringify(finalAnswers))
    const res = await createBooking(fd)
    setLoading(false)
    if (res.error) setError(res.error)
    else setBookingId(res.bookingId || 'ok')
  }

  // ═══ TG Redirect screen ═══
  if (tgRedirect) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 420, width: '100%' }}>
          <div style={{ ...cardStyle, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>💬</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Напишите нам</div>
            <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.6 }}>
              Мы подберём для вас лучшие варианты обучения с учётом вашего бюджета
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 280 }}>
              <a href="https://t.me/goandstudycom" target="_blank" rel="noopener"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '14px 32px', borderRadius: 14, fontSize: 16, fontWeight: 700,
                  background: '#0088cc', color: '#fff', textDecoration: 'none',
                }}>
                Написать в Telegram
              </a>
              <a href="https://wa.me/995595100249" target="_blank" rel="noopener"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '14px 32px', borderRadius: 14, fontSize: 16, fontWeight: 700,
                  background: '#25d366', color: '#fff', textDecoration: 'none',
                }}>
                Написать в WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ═══ Confirmation screen ═══
  if (bookingId) {
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
          <div style={{ ...cardStyle, padding: '16px 20px', textAlign: 'left' as const, minHeight: 'auto' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Наш менеджер свяжется с вами для подтверждения</div>
          </div>
          {bookingId !== 'ok' && (
            <a href={`/book/cancel?id=${bookingId}`} style={{ fontSize: 12, color: 'var(--red)', textDecoration: 'none', fontWeight: 500, marginTop: 16, display: 'inline-block' }}>Отменить запись</a>
          )}
        </div>
      </div>
    )
  }

  // Consultant card
  const consultantCard = (note?: string) => (
    <div className="consultant-card" style={{ position: 'absolute', right: -220, top: 0, width: 200 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="https://i.ibb.co/wZBkPXrY/consultant.jpg" alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', display: 'block', margin: '0 auto 8px' }} />
      <div style={{ background: 'rgba(255,237,204,.7)', borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Анна Юсипова</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Консультант</div>
        <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
          {note || 'После мы предложим вам удобную для вас дату и время'}
        </div>
      </div>
    </div>
  )

  // Nav buttons
  const navButtons = (nextLabel: string, onNext: () => void, disabled?: boolean) => (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 24 }}>
      {step > 0 && (
        <button onClick={() => { setStep(step - 1); setError('') }}
          style={{ width: 52, height: 52, borderRadius: 14, border: 'none', background: 'var(--purple)', color: '#fff', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          &#8592;
        </button>
      )}
      <button onClick={onNext} disabled={disabled}
        style={{
          padding: '14px 32px', borderRadius: 14, border: 'none', fontSize: 16, fontWeight: 700,
          background: 'var(--purple)', color: '#fff', cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', opacity: disabled ? 0.5 : 1,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
        {nextLabel} <span>&#8594;</span>
      </button>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', position: 'relative' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20, paddingTop: 8 }}>
          <img src="https://i.ibb.co/7tNx07SW/GAS-logo-01.png" alt="Go And Study" style={{ height: 48, objectFit: 'contain', marginBottom: 10 }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Запись на консультацию</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Выберите удобные дату и время</div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 4, background: 'var(--bor)', borderRadius: 4, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'var(--purple)', borderRadius: 4, width: `${progress}%`, transition: 'width .3s' }} />
        </div>

        {/* ═══ Quiz Steps ═══ */}
        {isQuizStep && (() => {
          const q = QUIZ_STEPS[step]
          return (
            <div style={{ ...cardStyle, position: 'relative' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 16, lineHeight: 1.3 }}>{q.title}</div>
              {q.id === 'contacts' && <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 16 }}>Менеджер свяжется с вами <strong>через 10 минут</strong></div>}

              <div style={{ flex: 1 }}>
                {q.type === 'contacts' && (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <input value={answers.client_name || ''} onChange={e => setAnswer('client_name', e.target.value)} placeholder="Имя" autoComplete="name" style={inputStyle} />
                    <input value={answers.client_phone || ''} onChange={e => setAnswer('client_phone', e.target.value)} placeholder="+7 (000) 000-00-00" type="tel" autoComplete="tel" style={inputStyle} />
                    <input value={answers.client_telegram || ''} onChange={e => setAnswer('client_telegram', e.target.value)} placeholder="Телеграмм логин (@.....)" style={inputStyle} />
                  </div>
                )}

                {q.type === 'slider' && (
                  <div style={{ padding: '20px 0' }}>
                    <div style={{ textAlign: 'center', marginBottom: 12 }}>
                      <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 8, border: '1px solid var(--bor2)', fontSize: 16, fontWeight: 700 }}>{answers[q.id] ?? q.defaultValue}</span>
                    </div>
                    <input type="range" min={q.min} max={q.max} value={answers[q.id] ?? q.defaultValue}
                      onChange={e => setAnswer(q.id, Number(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--purple)' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      <span>{q.min}</span><span>{q.max}+</span>
                    </div>
                  </div>
                )}

                {q.type === 'radio' && (
                  <div style={{ display: 'grid', gridTemplateColumns: q.options!.length <= 3 ? 'repeat(auto-fill, minmax(200px, 1fr))' : '1fr 1fr', gap: 10 }}>
                    {q.options!.map(opt => {
                      const selected = answers[q.id] === opt
                      return (
                        <button key={opt} onClick={() => handleRadioSelect(q.id, opt)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                            borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                            background: selected ? 'rgba(177,94,204,.12)' : 'var(--bg)',
                            textAlign: 'left', fontSize: 14, color: 'var(--text)', fontWeight: selected ? 600 : 400,
                            transition: 'background .15s',
                          }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                            border: selected ? '6px solid var(--purple)' : '2px solid rgba(177,94,204,.3)',
                            boxSizing: 'border-box', transition: 'border .15s',
                          }} />
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                )}

                {q.type === 'checkbox' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {q.options!.map(opt => {
                        const checked = (answers[q.id] || []).includes(opt)
                        return (
                          <button key={opt} onClick={() => toggleCheckbox(q.id, opt)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                              borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                              background: checked ? 'rgba(177,94,204,.12)' : 'var(--bg)',
                              textAlign: 'left', fontSize: 13, color: 'var(--text)', fontWeight: checked ? 600 : 400,
                            }}>
                            <div style={{
                              width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                              border: checked ? 'none' : '2px solid rgba(177,94,204,.3)',
                              background: checked ? 'var(--purple)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {checked && <svg viewBox="0 0 9 7" fill="none" stroke="#fff" strokeWidth="2" width="10" height="10"><polyline points="1,3.5 3.5,6 8,1" /></svg>}
                            </div>
                            {opt}
                          </button>
                        )
                      })}
                    </div>
                    {/* Custom variant text input */}
                    {(answers[q.id] || []).includes('Свой вариант') && (
                      <input value={customVariant} onChange={e => setCustomVariant(e.target.value)}
                        placeholder="Опишите ваш вариант..."
                        style={{ ...inputStyle, marginTop: 10 }} />
                    )}
                    {q.hint && <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', marginTop: 10 }}>{q.hint}</div>}
                  </>
                )}

                {q.type === 'textarea' && (
                  <textarea value={answers[q.id] || ''} onChange={e => setAnswer(q.id, e.target.value)}
                    rows={4} placeholder="Ваш ответ..." style={{ ...inputStyle, resize: 'vertical', minHeight: 100 }} />
                )}

                {q.type === 'text' && (
                  <input value={answers[q.id] || ''} onChange={e => setAnswer(q.id, e.target.value)}
                    placeholder={(q as any).placeholder || ''} style={inputStyle} />
                )}
              </div>

              {(q.id === 'contacts' || q.showConsultant) && consultantCard(q.id === 'contacts' ? undefined : (q as any).consultantNote)}

              {error && <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(220,53,69,.07)', borderRadius: 10, fontSize: 13, color: 'var(--red)' }}>{error}</div>}

              {/* Show nav buttons only for non-radio types, or final radio, or contacts/slider/textarea/checkbox/text */}
              {(q.type !== 'radio' || q.isFinal) && navButtons(
                q.isFinal ? 'Получить консультацию' : 'Далее',
                () => {
                  if (!canProceed()) { setError('Заполните обязательные поля'); return }
                  // Save slider default if not changed
                  if (q.type === 'slider' && answers[q.id] === undefined) setAnswer(q.id, (q as any).defaultValue)
                  setError(''); setStep(step + 1)
                },
                false
              )}
            </div>
          )
        })()}

        {/* ═══ Date Step ═══ */}
        {isDateStep && (
          <div style={cardStyle}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>Выберите дату</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>Для бесплатной консультации</div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <button onClick={() => shiftMonth(-1)} style={{ width: 36, height: 36, border: '1px solid var(--bor2)', borderRadius: 10, background: 'var(--surf)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14"><polyline points="10,4 6,8 10,12" /></svg>
              </button>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{MONTHS[viewMonth]} {viewYear}</span>
              <button onClick={() => shiftMonth(1)} style={{ width: 36, height: 36, border: '1px solid var(--bor2)', borderRadius: 10, background: 'var(--surf)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14"><polyline points="6,4 10,8 6,12" /></svg>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, flex: 1 }}>
              {WEEKDAYS.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--muted)', padding: '6px 0' }}>{d}</div>)}
              {weeks.flat().map((day, i) => {
                if (day === null) return <div key={i} />
                const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const hasSlots = datesWithSlots.has(dateStr)
                const isPast = dateStr < todayStr
                const isToday = dateStr === todayStr
                const isSel = dateStr === selectedDate
                return (
                  <button key={i} disabled={!hasSlots || isPast}
                    onClick={() => setSelectedDate(dateStr)}
                    style={{
                      width: '100%', aspectRatio: '1', borderRadius: 12, border: 'none',
                      background: isSel ? 'var(--purple)' : hasSlots && !isPast ? 'rgba(177,94,204,.08)' : 'transparent',
                      color: isSel ? '#fff' : isPast || !hasSlots ? 'var(--muted2)' : 'var(--text)',
                      fontWeight: isToday || isSel ? 800 : 500, fontSize: 14,
                      cursor: hasSlots && !isPast ? 'pointer' : 'default', fontFamily: 'inherit',
                    }}>
                    {day}
                    {hasSlots && !isPast && !isSel && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--purple)', margin: '2px auto 0' }} />}
                  </button>
                )
              })}
            </div>

            {navButtons('Далее', () => { if (selectedDate) { setStep(step + 1); setSelectedTime(null) } }, !selectedDate)}
          </div>
        )}

        {/* ═══ Time Step ═══ */}
        {isTimeStep && (
          <div style={cardStyle}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>Выберите время</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
              {selectedDate && new Date(selectedDate + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, flex: 1 }}>
              {dateSlots.map(slot => {
                const time = slot.start_time.slice(0, 5)
                const isSel = time === selectedTime
                return (
                  <button key={time} onClick={() => setSelectedTime(time)}
                    style={{
                      padding: '16px 8px', borderRadius: 14, fontSize: 18, fontWeight: 700,
                      border: isSel ? '2px solid var(--purple)' : '1px solid var(--bor2)',
                      background: isSel ? 'rgba(177,94,204,.1)' : 'var(--surf)',
                      color: isSel ? 'var(--purple)' : 'var(--text)',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                    {time}
                  </button>
                )
              })}
            </div>

            {error && <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(220,53,69,.07)', borderRadius: 10, fontSize: 13, color: 'var(--red)' }}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 24 }}>
              <button onClick={() => setStep(step - 1)}
                style={{ width: 52, height: 52, borderRadius: 14, border: 'none', background: 'var(--purple)', color: '#fff', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                &#8592;
              </button>
              <button onClick={() => { if (selectedTime) handleSubmit() }}
                disabled={!selectedTime || loading}
                style={{
                  padding: '14px 32px', borderRadius: 14, border: 'none', fontSize: 16, fontWeight: 700,
                  background: 'var(--purple)', color: '#fff', cursor: selectedTime && !loading ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit', opacity: selectedTime ? 1 : 0.5,
                }}>
                {loading ? 'Записываем...' : 'Записаться'}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .consultant-card { display: none; }
        @media (min-width: 900px) { .consultant-card { display: block; } }
      `}</style>
    </div>
  )
}
