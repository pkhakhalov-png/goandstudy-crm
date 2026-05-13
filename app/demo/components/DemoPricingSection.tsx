'use client'

import { useState } from 'react'

type Bullet = { text: string; included: boolean }
type Package = {
  id: 'basic' | 'full' | 'vip'
  tier: string
  name: string
  price: number
  tagline: string
  highlight?: boolean
  dark?: boolean
  bullets: Bullet[]
  detail: {
    title: string
    leftColumn: string[]
    rightColumn?: string[]
    note?: string
    guarantee?: boolean
  }
}

const PACKAGES: Package[] = [
  {
    id: 'basic',
    tier: 'Основы поступления',
    name: 'Базовый',
    price: 175_000,
    tagline: 'Ментор на каждом этапе',
    bullets: [
      { text: 'Стратегическая сессия',         included: true },
      { text: 'До 3х университетов',           included: true },
      { text: 'Корректировка документов',      included: true },
      { text: 'Переписка с ВУЗами',            included: false },
      { text: 'Визовое сопровождение',         included: false },
    ],
    detail: {
      title: 'ОСНОВЫ ПОСТУПЛЕНИЯ',
      leftColumn: [
        'Стратегическая сессия',
        'Количество университетов — до 3',
        'Подготовка документов — вы пишете сами, мы даем рекомендации по корректировке и предоставляем готовые примеры',
        'Подготовка и подача заявок — мы делаем проверку, чтобы убедиться в правильности заполнения',
      ],
      note: 'Этот пакет хорошо подходит, если вы хотите пройти процесс самостоятельно, но при этом снизить риски ошибок и быть уверенными в правильности ключевых шагов.',
    },
  },
  {
    id: 'full',
    tier: 'Полное сопровождение',
    name: 'Под ключ',
    price: 290_000,
    tagline: 'Лучшее решение для поступления',
    highlight: true,
    bullets: [
      { text: 'Стратегическая сессия',          included: true },
      { text: 'Без ограничений по ВУЗам',       included: true },
      { text: 'Документы «под ключ»',           included: true },
      { text: 'Переписка с университетами',     included: true },
      { text: 'Визовое сопровождение',          included: true },
      { text: 'Личный кабинет',                 included: true },
      { text: 'Гарантия поступления',           included: false },
    ],
    detail: {
      title: 'СОПРОВОЖДЕНИЕ ПОД КЛЮЧ',
      leftColumn: [
        'Определение целей и задач',
        'Подбор университетов, программ и стипендий',
        'Разработка стратегии поступления',
        'Работа над усилением профиля студента',
        'Организация языковых курсов (по запросу)',
        'Подготовка полного пакета документов (резюме / рекомендательные, мотивационные письма, портфолио, подготовка к интервью и любые другие документы по требованию ВУЗа)',
      ],
      rightColumn: [
        'Подача документов в университеты; нет ограничения по кол-ву ВУЗов',
        'Коммуникация с университетами',
        'Помощь в поиске и бронировании жилья',
        'Оформление визы',
        'Личный кабинет — доступ к платформе go&study со всеми материалами и онлайн-документами',
      ],
      guarantee: true,
    },
  },
  {
    id: 'vip',
    tier: 'VIP обслуживание',
    name: 'Премиум',
    price: 455_000,
    tagline: 'Максимальный результат',
    dark: true,
    bullets: [
      { text: 'Глубокий анализ + профориентация', included: true },
      { text: 'Персональный куратор',             included: true },
      { text: 'Организация визитов в ВУЗы',       included: true },
      { text: '3 месяца адаптации',               included: true },
      { text: 'Личный кабинет — VIP доступ',      included: true },
      { text: 'Дополнительные опции',             included: true },
    ],
    detail: {
      title: 'VIP ОБСЛУЖИВАНИЕ',
      leftColumn: [
        'Стратегическая сессия',
        'Подбор университетов, программ и стипендий (с посещением ВУЗов)',
        'Подготовка документов «под ключ» (CV, мотивационное, рекомендации) + адаптация под ВУЗы',
        'Переписка с университетами',
        'Работа с офферами (индивидуальный разбор)',
        'Enrollment (регистрация)',
        'Резиденция и страховка (все варианты + расширенная страховка)',
      ],
      rightColumn: [
        'Визовое сопровождение до получения визы + подготовка к собеседованию',
        'Персональный куратор ведет семью, приоритетные ответы',
        '6 месяцев адаптации после приезда',
        'Опекунство, трансфер, репетиции',
        'Гарантия поступления через полный цикл',
        'Личный кабинет — VIP-доступ к платформе go&study с приоритетными ответами и расширенной аналитикой',
      ],
      guarantee: true,
    },
  },
]

function formatPrice(n: number): string {
  return `₽${n.toLocaleString('ru-RU').replace(/\s/g, ' ')}`
}

export function DemoPricingSection() {
  const [openPkg, setOpenPkg] = useState<Package | null>(null)

  return (
    <section
      style={{
        position: 'relative',
        marginTop: 80,
        padding: '80px 32px 100px',
        background: 'linear-gradient(180deg, var(--ds-bg) 0%, var(--ds-bg-alt) 100%)',
        borderTop: '1px solid var(--ds-border-soft)',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <header style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ds-purple)', marginBottom: 12 }}>
            Полное сопровождение от Go &amp; Study
          </div>
          <h2 style={{
            fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700,
            fontSize: 'clamp(32px, 5vw, 56px)', letterSpacing: '0.02em',
            lineHeight: 1, margin: 0, textTransform: 'uppercase',
          }}>
            Готов начать <span className="ds-hl">по-настоящему</span>?
          </h2>
          <p style={{ fontSize: 16, color: 'var(--ds-ink-dim)', maxWidth: 720, margin: '20px auto 0', lineHeight: 1.5 }}>
            Этот кабинет — демонстрация. Если хочешь работать с реальным куратором, выбери пакет ниже. Кратко о том, как мы работаем — на видео.
          </p>
        </header>

        {/* Video */}
        <div style={{
          maxWidth: 960, margin: '0 auto 64px',
          borderRadius: 24, overflow: 'hidden',
          boxShadow: '0 30px 80px -20px rgba(20,18,30,0.25)',
          background: '#000',
        }}>
          <div style={{ position: 'relative', aspectRatio: '16 / 9' }}>
            <iframe
              src="https://vk.com/video_ext.php?oid=-31743815&id=456239197&hd=2"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock;"
              allowFullScreen
              title="О компании Go &amp; Study"
            />
          </div>
        </div>

        {/* Packages grid */}
        <div
          className="demo-pricing-grid"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, alignItems: 'stretch' }}
        >
          <style>{`
            @media (max-width: 960px) {
              .demo-pricing-grid { grid-template-columns: 1fr !important; max-width: 460px; margin: 0 auto; }
            }
          `}</style>
          {PACKAGES.map(pkg => (
            <PackageCard key={pkg.id} pkg={pkg} onOpen={() => setOpenPkg(pkg)} />
          ))}
        </div>
      </div>

      {openPkg && <PackageModal pkg={openPkg} onClose={() => setOpenPkg(null)} />}
    </section>
  )
}

function PackageCard({ pkg, onOpen }: { pkg: Package; onOpen: () => void }) {
  const isHighlight = pkg.highlight
  const isDark = pkg.dark

  const bg = isHighlight ? '#B15ECC' : isDark ? '#1D1D1F' : '#FFFFFF'
  const text = isHighlight || isDark ? '#FFFFFF' : 'var(--ds-ink)'
  const muted = isHighlight ? 'rgba(255,255,255,0.85)' : isDark ? 'rgba(255,255,255,0.65)' : 'var(--ds-muted)'
  const border = isHighlight ? '#B15ECC' : isDark ? '#1D1D1F' : 'var(--ds-border)'

  return (
    <article
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 22,
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        boxShadow: isHighlight
          ? '0 30px 60px -20px rgba(177,94,204,0.45)'
          : isDark
            ? '0 20px 50px -20px rgba(20,18,30,0.35)'
            : '0 12px 30px -15px rgba(20,18,30,0.15)',
        transform: isHighlight ? 'translateY(-12px)' : 'none',
      }}
    >
      {/* Tier label */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: isHighlight || isDark ? '#fff' : 'var(--ds-purple)',
          background: isHighlight ? 'rgba(255,255,255,0.18)' : isDark ? 'rgba(255,255,255,0.10)' : 'var(--ds-purple-soft)',
          padding: '6px 12px', borderRadius: 999,
        }}>
          {pkg.tier}
        </div>
        <div style={{ fontSize: 22 }}>
          {pkg.id === 'basic' ? '🏛️🏛️' : pkg.id === 'full' ? '🏛️🏛️🏛️' : '💰💰💰'}
        </div>
      </div>

      {/* Name */}
      <div>
        <div style={{
          fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700,
          fontSize: 28, letterSpacing: '0.02em', textTransform: 'uppercase',
          color: isHighlight || isDark ? '#fff' : 'var(--ds-purple)',
          lineHeight: 1,
        }}>
          {pkg.name}
        </div>
      </div>

      {/* Price */}
      <div>
        <div style={{
          fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700,
          fontSize: 42, letterSpacing: '-0.02em',
          color: text, lineHeight: 1,
        }}>
          {formatPrice(pkg.price)}
        </div>
        <div style={{ fontSize: 13, color: muted, marginTop: 6, fontStyle: 'italic' }}>
          {pkg.tagline}
        </div>
      </div>

      {/* Bullets */}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {pkg.bullets.map((b, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, lineHeight: 1.4, color: b.included ? text : muted, opacity: b.included ? 1 : 0.55 }}>
            <span style={{
              width: 18, height: 18, borderRadius: 4,
              background: b.included
                ? (isHighlight ? '#fff' : isDark ? '#fff' : '#2EA44F')
                : 'transparent',
              border: b.included ? 'none' : `1.5px solid ${muted}`,
              color: b.included ? (isHighlight ? '#B15ECC' : isDark ? '#1D1D1F' : '#fff') : muted,
              display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 1,
            }}>
              {b.included ? '✓' : '×'}
            </span>
            {b.text}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        onClick={onOpen}
        style={{
          marginTop: 8, padding: '14px 22px', borderRadius: 999,
          background: isHighlight ? '#1D1D1F' : isDark ? '#fff' : '#B15ECC',
          color: isHighlight ? '#fff' : isDark ? '#1D1D1F' : '#fff',
          border: 'none', cursor: 'pointer',
          fontFamily: 'var(--ds-font)', fontSize: 15, fontWeight: 600,
          letterSpacing: '0.02em',
          transition: 'transform 120ms',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)' }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
      >
        Подробнее
      </button>
    </article>
  )
}

function PackageModal({ pkg, onClose }: { pkg: Package; onClose: () => void }) {
  return (
    <div
      role="dialog" aria-modal="true" onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(20,18,30,0.65)', backdropFilter: 'blur(6px)',
        display: 'grid', placeItems: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--ds-bg)', borderRadius: 28,
          padding: '32px 36px 36px',
          position: 'relative',
          boxShadow: '0 30px 80px -20px rgba(20,18,30,0.45)',
        }}
      >
        <button
          onClick={onClose} aria-label="Закрыть"
          style={{
            position: 'absolute', top: 20, right: 20,
            width: 38, height: 38, borderRadius: '50%',
            background: 'var(--ds-purple)', color: '#fff',
            border: 'none', cursor: 'pointer',
            display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 700,
          }}
        >
          ✕
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24, paddingRight: 50 }}>
          <h3 style={{
            fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700,
            fontSize: 'clamp(22px, 3vw, 30px)', letterSpacing: '0.02em',
            textTransform: 'uppercase', margin: 0, color: 'var(--ds-ink)',
            borderBottom: '2px solid var(--ds-purple)', paddingBottom: 6,
            lineHeight: 1.2,
          }}>
            {pkg.detail.title}
          </h3>
          <span style={{
            fontSize: 13, fontWeight: 700,
            background: 'var(--ds-purple-soft)', color: 'var(--ds-purple-deep)',
            padding: '8px 16px', borderRadius: 999,
            whiteSpace: 'nowrap',
          }}>
            {formatPrice(pkg.price)}
          </span>
        </div>

        {/* Bullets */}
        <div style={{ display: 'grid', gridTemplateColumns: pkg.detail.rightColumn ? '1fr 1fr' : '1fr', gap: 32, marginBottom: 20 }}>
          <style>{`
            @media (max-width: 600px) {
              [data-modal-grid] { grid-template-columns: 1fr !important; gap: 16px !important; }
            }
          `}</style>
          <ul data-modal-grid style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {pkg.detail.leftColumn.map((p, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, fontSize: 14, lineHeight: 1.55, color: 'var(--ds-ink)' }}>
                <span style={{ color: 'var(--ds-purple)', fontWeight: 700, flexShrink: 0 }}>•</span>
                {p}
              </li>
            ))}
          </ul>
          {pkg.detail.rightColumn && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {pkg.detail.rightColumn.map((p, i) => (
                <li key={i} style={{ display: 'flex', gap: 10, fontSize: 14, lineHeight: 1.55, color: 'var(--ds-ink)' }}>
                  <span style={{ color: 'var(--ds-purple)', fontWeight: 700, flexShrink: 0 }}>•</span>
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>

        {pkg.detail.note && (
          <div style={{
            padding: '18px 22px', borderRadius: 14,
            background: 'var(--ds-bg-alt)', border: '1px solid var(--ds-border-soft)',
            fontSize: 13, color: 'var(--ds-ink-dim)', lineHeight: 1.55, textAlign: 'center',
            marginTop: 8,
          }}>
            {pkg.detail.note}
          </div>
        )}

        {pkg.detail.guarantee && (
          <div style={{
            marginTop: 20, textAlign: 'center',
            fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--ds-purple-deep)',
          }}>
            ГАРАНТИРУЕМ ПОСТУПЛЕНИЕ (прописываем в договоре)
          </div>
        )}

        {/* Note about pricing details */}
        <div style={{
          marginTop: 18, padding: '10px 16px',
          fontSize: 12, color: 'var(--ds-muted)', lineHeight: 1.5, textAlign: 'center',
          background: 'var(--ds-bg-alt)', borderRadius: 10,
        }}>
          Все детали работы / оплаты / рассрочки обсудим в ходе предварительного общения.
        </div>
      </div>
    </div>
  )
}
