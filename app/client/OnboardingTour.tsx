'use client'

import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { markOnboarded } from './onboarding-actions'

interface Step {
  /** CSS-селектор подсвечиваемого элемента. Если не найден — шаг становится центральной модалкой. */
  selector: string | null
  title: string
  body: string
  emoji: string
}

const STEPS: Step[] = [
  {
    selector: null,
    emoji: '👋',
    title: 'Добро пожаловать',
    body: 'Это твой личный кабинет. Покажу за минуту что где — для каждого блока подсвечу ту часть экрана о которой говорю.',
  },
  {
    selector: '[data-tour="timeline"]',
    emoji: '🗺',
    title: 'Сроки и этапы',
    body: 'Вот таймлайн твоего проекта. Видишь на каком ты этапе и что куратор уже сделал.',
  },
  {
    selector: '[data-tour="shortlist"]',
    emoji: '🎓',
    title: 'Подборка вузов',
    body: 'Куратор отбирает программы под твой профиль. Тут — топ-3, полный список открывается через меню «Вузы».',
  },
  {
    selector: '[data-tour="documents"]',
    emoji: '📂',
    title: 'Документы',
    body: 'Загружай сюда сканы — паспорт, аттестат, сертификаты. Видно статус каждого документа.',
  },
  {
    selector: '[data-tour="essays"]',
    emoji: '✍️',
    title: 'Резюме и мотивашка',
    body: 'CV и motivation letter — заполняешь сам, куратор финалит. Открой карточку чтобы начать.',
  },
  {
    selector: '[data-tour="curator-link"]',
    emoji: '💬',
    title: 'Куратор',
    body: 'Все вопросы — куратору в этом разделе. Отвечает в течение рабочего дня.',
  },
  {
    selector: null,
    emoji: '🚀',
    title: 'Готово!',
    body: 'Изучай кабинет, заполняй документы. Чем раньше начнём — тем проще будет дальше.',
  },
]

const PADDING = 8

export function OnboardingTour({ clientId }: { clientId: number }) {
  const [step, setStep] = useState(0)
  const [closing, setClosing] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const isCenter = !current.selector

  // Находим целевой элемент на каждый шаг + слушаем resize/scroll
  useLayoutEffect(() => {
    if (isCenter) { setRect(null); return }
    function update() {
      if (!current.selector) return
      const el = document.querySelector(current.selector) as HTMLElement | null
      if (!el) { setRect(null); return }
      // Скроллим элемент в видимую часть
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Даём анимации скрола чуть времени, потом снимаем bbox
      setTimeout(() => {
        const r = el.getBoundingClientRect()
        setRect(r)
      }, 350)
    }
    update()
    const onResize = () => {
      if (!current.selector) return
      const el = document.querySelector(current.selector) as HTMLElement | null
      if (el) setRect(el.getBoundingClientRect())
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [step, current.selector, isCenter])

  async function finish() {
    setClosing(true)
    try { await markOnboarded(clientId) } catch {}
  }

  if (closing) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      pointerEvents: 'auto',
      fontFamily: '-apple-system, sans-serif',
    }}>
      {/* SPOTLIGHT режим — 4 затемняющих div'а вокруг таргета */}
      {!isCenter && rect && (
        <>
          {/* top */}
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0,
            height: Math.max(0, rect.top - PADDING),
            background: 'rgba(20,18,30,0.6)', backdropFilter: 'blur(4px)',
          }} />
          {/* bottom */}
          <div style={{
            position: 'fixed', top: rect.bottom + PADDING, left: 0, right: 0, bottom: 0,
            background: 'rgba(20,18,30,0.6)', backdropFilter: 'blur(4px)',
          }} />
          {/* left */}
          <div style={{
            position: 'fixed',
            top: Math.max(0, rect.top - PADDING),
            height: rect.height + PADDING * 2,
            left: 0, width: Math.max(0, rect.left - PADDING),
            background: 'rgba(20,18,30,0.6)', backdropFilter: 'blur(4px)',
          }} />
          {/* right */}
          <div style={{
            position: 'fixed',
            top: Math.max(0, rect.top - PADDING),
            height: rect.height + PADDING * 2,
            left: rect.right + PADDING, right: 0,
            background: 'rgba(20,18,30,0.6)', backdropFilter: 'blur(4px)',
          }} />
          {/* контур-ободок вокруг подсвеченного блока */}
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

      {/* CENTER режим — обычный затемняющий оверлей */}
      {isCenter && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(20,18,30,0.6)', backdropFilter: 'blur(8px)',
        }} />
      )}

      {/* Tooltip / Modal */}
      <Tooltip
        rect={isCenter ? null : rect}
        step={step}
        total={STEPS.length}
        emoji={current.emoji}
        title={current.title}
        body={current.body}
        isLast={isLast}
        onSkip={finish}
        onPrev={() => setStep(s => Math.max(0, s - 1))}
        onNext={() => isLast ? finish() : setStep(s => s + 1)}
        ref={tooltipRef}
      />
    </div>
  )
}

interface TooltipProps {
  rect: DOMRect | null
  step: number
  total: number
  emoji: string
  title: string
  body: string
  isLast: boolean
  onSkip: () => void
  onPrev: () => void
  onNext: () => void
}

import { forwardRef } from 'react'

const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(function Tooltip(props, ref) {
  const { rect, step, total, emoji, title, body, isLast, onSkip, onPrev, onNext } = props

  // Если rect нет — центрируем модалку
  let style: React.CSSProperties = {}
  if (rect) {
    // Решаем где разместить: снизу элемента, если влезет; иначе сверху
    const tooltipHeight = 240
    const tooltipWidth = 360
    const margin = 16
    const spaceBelow = window.innerHeight - rect.bottom
    const placeBelow = spaceBelow > tooltipHeight + margin

    // Горизонтально — центрируем по элементу, но не выходим за края
    let left = rect.left + rect.width / 2 - tooltipWidth / 2
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16))

    style = {
      position: 'fixed',
      top: placeBelow ? rect.bottom + margin : Math.max(16, rect.top - tooltipHeight - margin),
      left,
      width: tooltipWidth,
    }
  } else {
    style = {
      position: 'fixed',
      top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 'min(440px, calc(100% - 32px))',
    }
  }

  return (
    <div ref={ref} style={{
      ...style,
      background: '#fff', borderRadius: 16,
      padding: 24, boxShadow: '0 24px 60px rgba(20,18,30,0.3)',
      animation: 'fade-in 0.2s ease',
    }}>
      <style>{`@keyframes fade-in { from { opacity: 0; transform: translate(-50%, -48%) } to { opacity: 1; transform: translate(-50%, -50%) } }`}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{emoji}</div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#B15ECC', marginBottom: 4 }}>
            Шаг {step + 1} из {total}
          </div>
          <h2 style={{
            fontSize: 18, fontWeight: 700, margin: 0,
            letterSpacing: '-0.01em', color: '#14121e', lineHeight: 1.25,
          }}>
            {title}
          </h2>
        </div>
      </div>
      <p style={{
        fontSize: 14, color: '#443f56', lineHeight: 1.5,
        margin: '0 0 20px',
      }}>
        {body}
      </p>

      {/* Прогресс-точки */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i <= step ? '#B15ECC' : '#ebe7f0',
            transition: 'all 0.2s',
          }} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" onClick={onSkip} style={{
          padding: '8px 12px', fontSize: 12, fontWeight: 500,
          background: 'transparent', color: '#8a8796',
          border: 'none', borderRadius: 8, cursor: 'pointer',
          fontFamily: 'inherit',
        }}>
          Пропустить
        </button>
        <div style={{ display: 'flex', gap: 6 }}>
          {step > 0 && (
            <button type="button" onClick={onPrev} style={{
              padding: '8px 16px', fontSize: 12, fontWeight: 600,
              background: '#F9F8FC', color: '#14121e',
              border: '1px solid rgba(0,0,0,.08)', borderRadius: 8,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              ← Назад
            </button>
          )}
          <button type="button" onClick={onNext} style={{
            padding: '8px 18px', fontSize: 12, fontWeight: 600,
            background: '#B15ECC', color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            {isLast ? 'Поехали 🚀' : 'Далее →'}
          </button>
        </div>
      </div>
    </div>
  )
})
