'use client'

import { useState, useEffect } from 'react'
import { markOnboarded } from './onboarding-actions'

interface Step {
  title: string
  body: string
  emoji: string
}

const STEPS: Step[] = [
  {
    emoji: '👋',
    title: 'Добро пожаловать',
    body: 'Здесь твой личный кабинет — всё про поступление в одном месте. Покажу за минуту, что где.',
  },
  {
    emoji: '🗺',
    title: 'Сроки и этапы',
    body: 'Вверху страницы — таймлайн. Видишь на каком ты этапе и что куратор уже сделал, что впереди.',
  },
  {
    emoji: '🎓',
    title: 'Подборка вузов',
    body: 'Куратор отбирает программы под твой профиль. Открыть полный список — вкладка «Вузы» в верхнем меню. Можешь отметить приоритетные.',
  },
  {
    emoji: '📂',
    title: 'Документы',
    body: 'Загружай сюда сканы — паспорт, аттестат, сертификаты. Вкладка «Документы» в меню.',
  },
  {
    emoji: '✍️',
    title: 'Резюме и мотивашка',
    body: 'CV и motivation letter — заполняешь сам, куратор финалит. Появятся карточки на главной.',
  },
  {
    emoji: '💬',
    title: 'Куратор',
    body: 'Все вопросы — куратору в раздел «Куратор» в меню. Отвечает в течение рабочего дня.',
  },
  {
    emoji: '🚀',
    title: 'Готово!',
    body: 'Изучай кабинет, заполняй документы. Чем раньше начнём — тем проще будет дальше.',
  },
]

export function OnboardingTour({ clientId }: { clientId: number }) {
  const [step, setStep] = useState(0)
  const [closing, setClosing] = useState(false)

  // Скроллим в начало страницы при показе
  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  async function finish() {
    setClosing(true)
    try {
      await markOnboarded(clientId)
    } catch {}
  }

  if (closing) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(20, 18, 30, 0.55)',
        backdropFilter: 'blur(8px)',
        display: 'grid', placeItems: 'center', padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) finish() }}
    >
      <div style={{
        background: '#fff', borderRadius: 20, maxWidth: 480, width: '100%',
        padding: '40px 32px 32px', boxShadow: '0 24px 60px rgba(20,18,30,0.25)',
        textAlign: 'center', fontFamily: '-apple-system, sans-serif',
        animation: 'fade-in 0.2s ease',
      }}>
        <style>{`@keyframes fade-in { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }`}</style>
        <div style={{ fontSize: 56, marginBottom: 12 }}>{current.emoji}</div>
        <h2 style={{
          fontSize: 22, fontWeight: 700, margin: '0 0 12px',
          letterSpacing: '-0.01em', color: '#14121e',
        }}>
          {current.title}
        </h2>
        <p style={{
          fontSize: 15, color: '#443f56', lineHeight: 1.55,
          margin: '0 0 28px', maxWidth: 360, marginLeft: 'auto', marginRight: 'auto',
        }}>
          {current.body}
        </p>

        {/* Прогресс-точки */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 24 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 24 : 6, height: 6, borderRadius: 4,
              background: i === step ? '#B15ECC' : i < step ? '#d2c4dc' : '#ebe7f0',
              transition: 'all 0.2s',
            }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            type="button"
            onClick={finish}
            style={{
              padding: '12px 20px', fontSize: 13, fontWeight: 500,
              background: 'transparent', color: '#8a8796',
              border: 'none', borderRadius: 10, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Пропустить
          </button>
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              style={{
                padding: '12px 20px', fontSize: 13, fontWeight: 600,
                background: '#F9F8FC', color: '#14121e',
                border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              ← Назад
            </button>
          )}
          <button
            type="button"
            onClick={() => isLast ? finish() : setStep(s => s + 1)}
            style={{
              padding: '12px 24px', fontSize: 13, fontWeight: 600,
              background: '#B15ECC', color: '#fff',
              border: 'none', borderRadius: 10, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {isLast ? 'Поехали 🚀' : 'Далее →'}
          </button>
        </div>
      </div>
    </div>
  )
}
