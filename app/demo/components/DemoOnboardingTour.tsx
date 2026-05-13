'use client'

import { useEffect, useState } from 'react'
import { useDemoState } from '../DemoState'

const STEPS: { title: string; body: string; selector?: string }[] = [
  {
    title: 'Привет! Это твой демо-кабинет',
    body: 'Здесь ты увидишь как выглядит работа с куратором: подборка вузов, документы, эссе, заявки. Всё можно потыкать. Все данные демо — после закрытия вкладки кабинет сбросится.',
  },
  {
    title: 'Прогресс по этапам',
    body: 'Вверху — твой путь от знакомства до поступления. Каждый этап подсвечивается когда вы с куратором его проходите.',
    selector: '[data-tour="timeline"]',
  },
  {
    title: 'Подборка вузов',
    body: 'Куратор подбирает программы под твой профиль. Ты ставишь приоритеты — по ним готовятся заявки и эссе.',
    selector: '[data-tour="shortlist"]',
  },
  {
    title: 'Эссе и резюме',
    body: 'Заполняешь сам — куратор смотрит и помогает довести до финала. Шаблоны построены под формат UCAS / resume.io.',
    selector: '[data-tour="essays"]',
  },
  {
    title: 'Документы',
    body: 'Сюда заливаешь паспорт, аттестат, IELTS и прочее. Куратор увидит и подскажет если что-то не так.',
    selector: '[data-tour="documents"]',
  },
  {
    title: 'Готово!',
    body: 'Лазь куда угодно — это полностью изолированный демо. Когда захочешь начать настоящее сопровождение — жми «К покупке» в шапке.',
  },
]

export function DemoOnboardingTour() {
  const { markTourSeen } = useDemoState()
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const current = STEPS[step]

  useEffect(() => {
    if (!current.selector) {
      setRect(null)
      return
    }
    const el = document.querySelector(current.selector) as HTMLElement | null
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => setRect(el.getBoundingClientRect()), 400)
    } else {
      setRect(null)
    }
  }, [step, current.selector])

  function next() {
    if (step + 1 >= STEPS.length) {
      markTourSeen()
    } else {
      setStep(step + 1)
    }
  }

  function skip() {
    markTourSeen()
  }

  const isSpotlight = !!rect
  const isFirst = step === 0
  const isLast = step === STEPS.length - 1

  const PADDING = 8

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'auto', fontFamily: 'var(--ds-font)' }}>
      {/* SPOTLIGHT режим — 4 затемняющих блока вокруг таргета, сам элемент остаётся в полной яркости */}
      {isSpotlight && rect && (
        <>
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0,
            height: Math.max(0, rect.top - PADDING),
            background: 'rgba(20,18,30,0.6)', backdropFilter: 'blur(4px)',
          }} onClick={skip} />
          <div style={{
            position: 'fixed', top: rect.bottom + PADDING, left: 0, right: 0, bottom: 0,
            background: 'rgba(20,18,30,0.6)', backdropFilter: 'blur(4px)',
          }} onClick={skip} />
          <div style={{
            position: 'fixed',
            top: Math.max(0, rect.top - PADDING),
            height: rect.height + PADDING * 2,
            left: 0, width: Math.max(0, rect.left - PADDING),
            background: 'rgba(20,18,30,0.6)', backdropFilter: 'blur(4px)',
          }} onClick={skip} />
          <div style={{
            position: 'fixed',
            top: Math.max(0, rect.top - PADDING),
            height: rect.height + PADDING * 2,
            left: rect.right + PADDING, right: 0,
            background: 'rgba(20,18,30,0.6)', backdropFilter: 'blur(4px)',
          }} onClick={skip} />
          <div style={{
            position: 'fixed',
            top: rect.top - PADDING,
            left: rect.left - PADDING,
            width: rect.width + PADDING * 2,
            height: rect.height + PADDING * 2,
            borderRadius: 14,
            border: '2px solid #B15ECC',
            boxShadow: '0 0 0 4px rgba(177,94,204,0.2), 0 12px 32px rgba(177,94,204,0.3)',
            pointerEvents: 'none',
          }} />
        </>
      )}

      {/* CENTER режим — единый затемняющий слой */}
      {!isSpotlight && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(20,18,30,0.6)', backdropFilter: 'blur(8px)',
        }} onClick={skip} />
      )}

      {/* карточка-tooltip — всегда по центру экрана, ничего не обрезается */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: '#fff',
        color: '#1a1129',
        borderRadius: 16,
        padding: '28px 32px',
        width: 480,
        maxWidth: 'calc(100vw - 40px)',
        maxHeight: 'calc(100vh - 40px)',
        overflowY: 'auto',
        boxShadow: '0 24px 80px rgba(20,12,32,.4)',
        pointerEvents: 'auto',
        zIndex: 1001,
      }}>
        <div style={{ fontSize: 10, color: 'var(--ds-purple)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
          Шаг {step + 1} из {STEPS.length}
        </div>
        <h3 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 22, margin: 0, marginBottom: 10, letterSpacing: '0.02em' }}>
          {current.title}
        </h3>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: '#4a3d63', margin: 0, marginBottom: 20 }}>
          {current.body}
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <button onClick={skip} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 12, color: '#888', fontWeight: 600,
            letterSpacing: '0.04em',
          }}>
            Пропустить
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isFirst && (
              <button onClick={() => setStep(step - 1)} style={{
                padding: '8px 16px', borderRadius: 8,
                border: '1px solid #ddd', background: '#fff', cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
              }}>
                ← Назад
              </button>
            )}
            <button onClick={next} style={{
              padding: '10px 20px', borderRadius: 8,
              border: 'none', background: 'var(--ds-purple)', color: '#fff',
              cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>
              {isLast ? 'Начать!' : 'Дальше →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
