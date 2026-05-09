import { DemoTopNav } from './DemoTopNav'
import { DashboardHero } from '@/app/client/DashboardHero'
import { ShortlistBlock } from '@/app/client/ShortlistBlock'
import { EssayCards } from '@/app/client/EssayCards'
import { DocumentsSection } from '@/app/client/DocumentsSection'
import { ApplicationsBlock } from '@/app/client/ApplicationsBlock'
import { CLIENT_CTX } from '@/app/client/mock-data'
import {
  DEMO_CLIENT_NAME,
  DEMO_TIMELINE,
  DEMO_UNIVERSITIES,
  DEMO_REQUIRED_DOCS,
  DEMO_ESSAYS,
  DEMO_APPLICATIONS,
} from './data'

export const dynamic = 'force-static'

/**
 * Изолированный демо-кабинет. НЕ ТРОГАЕТ БД. Всё данные — hardcoded в data.ts.
 * Любой может зайти на /demo без авторизации.
 */
export default function DemoDashboard() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg)' }}>
      <DemoTopNav activePage="home" />

      <DashboardHero
        ctx={{
          ...CLIENT_CTX,
          parentName: DEMO_CLIENT_NAME,
          childFirstName: 'Алексей',
          childFullName: DEMO_CLIENT_NAME,
        }}
        stages={DEMO_TIMELINE}
      />

      <main
        style={{
          maxWidth: 1200, margin: '0 auto', padding: '40px 32px 80px',
          display: 'flex', flexDirection: 'column', gap: 56,
        }}
      >
        <ShortlistBlock items={DEMO_UNIVERSITIES} total={DEMO_UNIVERSITIES.length} />
        <ApplicationsBlock applications={DEMO_APPLICATIONS} previewQuery="" />
        <EssayCards essays={DEMO_ESSAYS} />
        <DocumentsSection
          required={DEMO_REQUIRED_DOCS}
          optionalUploads={[]}
          clientId={0}
          requiredRowsByType={{}}
        />
      </main>
    </div>
  )
}
