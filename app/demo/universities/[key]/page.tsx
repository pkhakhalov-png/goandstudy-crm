'use client'

import Link from 'next/link'
import { useParams, notFound } from 'next/navigation'
import { DemoTopNav } from '../../DemoTopNav'
import { useDemoState, DEMO_UNIVERSITIES } from '../../DemoState'
import { DEMO_UNI_DETAILS } from '../../data'

export default function DemoUniversityPage() {
  const params = useParams<{ key: string }>()
  const key = params.key
  const { state, ready, togglePriority } = useDemoState()

  const uni = DEMO_UNIVERSITIES.find(u => u.key === key)
  const details = DEMO_UNI_DETAILS[key]

  if (!uni || !details) {
    if (ready) return notFound()
    return null
  }

  const isPriority = state.priorityKeys.includes(key)
  const priorityIdx = state.priorityKeys.indexOf(key)

  return (
    <>
      <DemoTopNav activePage="shortlist" />

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 32px 80px' }}>
        {/* Назад */}
        <Link href="/demo/shortlist" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'var(--ds-ink-dim)', textDecoration: 'none', marginBottom: 24,
        }}>
          ← К подборке
        </Link>

        {/* Hero */}
        <section style={{
          padding: '32px 36px', borderRadius: 20, background: 'var(--ds-surface)',
          border: '1px solid var(--ds-border-soft)', marginBottom: 32,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontSize: 12, color: 'var(--ds-ink-dim)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
                {uni.flag} {uni.country} · {uni.city}
              </div>
              <h1 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 32, letterSpacing: '0.02em', margin: 0, lineHeight: 1.2 }}>
                {uni.name}
              </h1>
              {uni.rank && (
                <div style={{ display: 'inline-block', marginTop: 12, padding: '6px 12px', borderRadius: 6, background: 'rgba(177,94,204,.1)', color: 'var(--ds-purple)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {uni.rank.source} World Rank #{uni.rank.value}
                </div>
              )}
            </div>
            <button onClick={() => togglePriority(uni.key)}
              style={{
                padding: '12px 22px', borderRadius: 10,
                border: '1px solid var(--ds-purple)',
                background: isPriority ? 'var(--ds-purple)' : '#fff',
                color: isPriority ? '#fff' : 'var(--ds-purple)',
                cursor: 'pointer',
                fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
              {isPriority ? `✓ В приоритете #${priorityIdx + 1}` : '+ В приоритет'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 20, paddingTop: 20, borderTop: '1px solid var(--ds-border-soft)' }}>
            <Stat label="Основан" value={String(details.founded)} />
            <Stat label="Тип" value={details.type} />
            <Stat label="Студентов" value={details.studentsTotal} />
            <Stat label="Язык" value={details.language} />
          </div>
        </section>

        {/* Описание */}
        <Section title="О вузе">
          <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--ds-ink)', margin: 0 }}>
            {details.description}
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ds-ink-dim)', marginTop: 16 }}>
            <b style={{ color: 'var(--ds-ink)' }}>Рейтинги: </b>{details.rankNote}
          </p>
        </Section>

        {/* Почему стоит сюда */}
        <Section title="Почему сюда стоит">
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ds-ink)', margin: 0 }}>
            {details.whyHere}
          </p>
        </Section>

        {/* Программы */}
        <Section title="Программы">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {details.programs.map((p, i) => (
              <div key={i} style={{
                padding: 18, borderRadius: 12, background: 'var(--ds-surface)',
                border: '1px solid var(--ds-border-soft)',
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ds-ink)', marginBottom: 8 }}>
                  {p.name}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                  <Pill label="Стоимость" value={p.tuition} />
                  <Pill label="Длительность" value={p.duration} />
                  <Pill label="App fee" value={p.fee} />
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Дедлайны */}
        <Section title="Intakes и дедлайны">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {details.intakes.map((it, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 18px', borderRadius: 10,
                background: 'var(--ds-surface)', border: '1px solid var(--ds-border-soft)',
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ds-ink)' }}>{it.term}</div>
                <div style={{ fontSize: 12, color: 'var(--ds-amber)', fontWeight: 700 }}>
                  Дедлайн: {it.deadline}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Требования */}
        <Section title="Требования к поступлению">
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.7, color: 'var(--ds-ink)' }}>
            {details.requirements.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </Section>

        {/* Стипендии и проживание */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>
          <Section title="Жильё" inGrid>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ds-ink)', margin: 0 }}>
              {details.accommodation}
            </p>
          </Section>
          <Section title="Стипендии" inGrid>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ds-ink)', margin: 0 }}>
              {details.scholarshipsHint}
            </p>
          </Section>
        </div>
      </main>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--ds-ink-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ds-ink)' }}>{value}</div>
    </div>
  )
}

function Section({ title, children, inGrid }: { title: string; children: React.ReactNode; inGrid?: boolean }) {
  return (
    <section style={{ marginBottom: inGrid ? 0 : 32, padding: inGrid ? '24px 28px' : 0, borderRadius: inGrid ? 16 : 0, background: inGrid ? 'var(--ds-surface)' : 'transparent', border: inGrid ? '1px solid var(--ds-border-soft)' : 'none' }}>
      <h2 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 18, letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0, marginBottom: 14 }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--ds-ink-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ds-ink)' }}>{value}</div>
    </div>
  )
}
