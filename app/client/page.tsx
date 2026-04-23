import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClientTopNav } from './ClientTopNav'
import { DashboardHero } from './DashboardHero'
import { ProjectAndRoadmap } from './ProjectAndRoadmap'
import { ShortlistBlock } from './ShortlistBlock'
import { EssayCards } from './EssayCards'
import { DocumentsSection } from './DocumentsSection'
import {
  CLIENT_CTX,
  TIMELINE_STAGES,
  ROADMAP,
  STUDENT_PROJECT,
  SHORTLIST_TOP,
  SHORTLIST_TOTAL,
  ESSAYS,
  REQUIRED_DOCS,
  OPTIONAL_DOCS,
} from './mock-data'

export default async function ClientHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  const displayName = profile?.name || user.email || CLIENT_CTX.parentName

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg)' }}>
      <ClientTopNav userName={displayName} activePage="home" />

      {/* 1 — ЭТАПНОСТЬ (ЗАФИКСИРОВАН) */}
      <DashboardHero ctx={CLIENT_CTX} stages={TIMELINE_STAGES} />

      <main
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '40px 32px 80px',
          display: 'flex',
          flexDirection: 'column',
          gap: 56,
        }}
      >
        {/* 2 — ПРОЕКТ СТУДЕНТА + ДОРОЖНАЯ КАРТА */}
        <ProjectAndRoadmap project={STUDENT_PROJECT} roadmap={ROADMAP} />

        {/* 3 — ПОДБОРКА ВУЗОВ (горизонтальный full-width) */}
        <ShortlistBlock items={SHORTLIST_TOP} total={SHORTLIST_TOTAL} />

        {/* 4 — РЕЗЮМЕ + МОТИВАЦИОННОЕ ПИСЬМО */}
        <EssayCards essays={ESSAYS} />

        {/* 5 — ДОКУМЕНТЫ */}
        <DocumentsSection required={REQUIRED_DOCS} optional={OPTIONAL_DOCS} />
      </main>
    </div>
  )
}
