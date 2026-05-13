'use client'

import { DemoTopNav } from './DemoTopNav'
import { useDemoState, DEMO_UNIVERSITIES } from './DemoState'
import { DemoHero } from './components/DemoHero'
import { DemoShortlistBlock } from './components/DemoShortlistBlock'
import { DemoEssayCards } from './components/DemoEssayCards'
import { DemoDocumentsSection } from './components/DemoDocumentsSection'
import { DemoApplicationsBlock } from './components/DemoApplicationsBlock'
import { DemoOnboardingTour } from './components/DemoOnboardingTour'
import { DEMO_TIMELINE, DEMO_APPLICATIONS, DEMO_CLIENT_NAME } from './data'

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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg)' }}>
      {!state.tourSeen && <DemoOnboardingTour />}
      <DemoTopNav activePage="home" />

      <div data-tour="timeline">
        <DemoHero
          parentName={DEMO_CLIENT_NAME}
          childFirstName="Алексей"
          childFullName={DEMO_CLIENT_NAME}
          stages={DEMO_TIMELINE}
        />
      </div>

      <main
        style={{
          maxWidth: 1200, margin: '0 auto', padding: '40px 32px 80px',
          display: 'flex', flexDirection: 'column', gap: 56,
        }}
      >
        <div data-tour="shortlist">
          <DemoShortlistBlock items={sortedUniversities} priorities={state.priorityKeys} />
        </div>
        <DemoApplicationsBlock applications={DEMO_APPLICATIONS} />
        <div data-tour="essays">
          <DemoEssayCards
            motivationStatus={state.motivationStatus}
            resumeStatus={state.resumeStatus}
          />
        </div>
        <div data-tour="documents">
          <DemoDocumentsSection />
        </div>
      </main>
    </div>
  )
}
