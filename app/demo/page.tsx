'use client'

import { DemoTopNav } from './DemoTopNav'
import { useDemoState, DEMO_UNIVERSITIES } from './DemoState'
import { DemoHero } from './components/DemoHero'
import { DemoShortlistBlock } from './components/DemoShortlistBlock'
import { DemoEssayCards } from './components/DemoEssayCards'
import { DemoDocumentsSection } from './components/DemoDocumentsSection'
import { DemoApplicationsBlock } from './components/DemoApplicationsBlock'
import { DemoOnboardingTour } from './components/DemoOnboardingTour'
import { DemoProjectAndRoadmap } from './components/DemoProjectAndRoadmap'
import { DemoPricingSection } from './components/DemoPricingSection'
import { DEMO_TIMELINE, DEMO_APPLICATIONS, DEMO_CLIENT_NAME, DEMO_REQUIRED_DOCS } from './data'
import type { Essay } from '@/app/client/mock-data'

export default function DemoDashboard() {
  const { state, ready } = useDemoState()

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--ds-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--ds-ink-dim)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Загружаем демо…</div>
      </div>
    )
  }

  // Сортируем подборку: приоритеты сверху по порядку
  const sortedUniversities = [...DEMO_UNIVERSITIES].sort((a, b) => {
    const aP = state.priorityKeys.indexOf(a.key)
    const bP = state.priorityKeys.indexOf(b.key)
    if (aP < 0 && bP < 0) return 0
    if (aP < 0) return 1
    if (bP < 0) return -1
    return aP - bP
  })

  const essays: Essay[] = [
    { key: 'resume',     title: 'Резюме',                  subtitle: 'CV в формате resume.io',     emoji: '📄', state: state.resumeStatus,     updatedAt: '2026-05-02' },
    { key: 'motivation', title: 'Мотивационное письмо',    subtitle: 'Personal Statement по UCAS', emoji: '✍️', state: state.motivationStatus, updatedAt: '2026-05-03' },
  ]

  // Документы: locked для resume/motivation если эссе ещё не "ready"
  const docs = DEMO_REQUIRED_DOCS.map(d => {
    if (d.key === 'resume') {
      if (state.resumeStatus === 'ready') {
        return { ...d, status: 'uploaded' as const, hint: 'Готово, куратор утвердил.', href: '/demo/resume', fileName: 'Резюме — финал', fileSize: '24 КБ' }
      }
      if (state.resumeStatus === 'sent' || state.resumeStatus === 'editing') {
        return { ...d, status: 'pending' as const, href: '/demo/resume', hint: 'Отправлено куратору, ждёт финал' }
      }
      return { ...d, status: 'locked' as const, lockedHint: 'Создаётся через блок «Резюме» выше. Загорится когда вы заполните, а куратор подготовит финальную версию.' }
    }
    if (d.key === 'motivation') {
      if (state.motivationStatus === 'ready') {
        return { ...d, status: 'uploaded' as const, hint: 'Готово, куратор утвердил.', href: '/demo/motivation', fileName: 'Мотивационное письмо — финал', fileSize: '24 КБ' }
      }
      if (state.motivationStatus === 'sent' || state.motivationStatus === 'editing') {
        return { ...d, status: 'pending' as const, href: '/demo/motivation', hint: 'Отправлено куратору, ждёт финал' }
      }
      return { ...d, status: 'locked' as const, lockedHint: 'Создаётся через блок «Мотивационное письмо» выше. Загорится когда вы заполните, а куратор подготовит финальную версию.' }
    }
    return d
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg)' }}>
      <DemoOnboardingTour />

      <DemoTopNav activePage="home" />

      <div data-tour="timeline">
        <DemoHero
          parentName={DEMO_CLIENT_NAME}
          childFirstName="Alexey"
          childFullName={DEMO_CLIENT_NAME}
          stages={DEMO_TIMELINE}
        />
      </div>

      <main className="demo-main" style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 32px 80px', display: 'flex', flexDirection: 'column', gap: 56 }}>
        <style>{`
          @media (max-width: 720px) {
            .demo-main { padding: 24px 16px 60px !important; gap: 36px !important; }
          }
        `}</style>
        <DemoProjectAndRoadmap />
        <div data-tour="shortlist">
          <DemoShortlistBlock items={sortedUniversities} total={sortedUniversities.length} />
        </div>
        <DemoApplicationsBlock applications={DEMO_APPLICATIONS} />
        <div data-tour="essays">
          <DemoEssayCards essays={essays} />
        </div>
        <div data-tour="documents">
          <DemoDocumentsSection required={docs} />
        </div>
      </main>

      <DemoPricingSection />
    </div>
  )
}
