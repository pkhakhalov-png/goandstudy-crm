import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

import {
  resolveClientForViewer,
  getClientTimeline,
  getClientUniversities,
  getClientDocumentRows,
  getClientEssays,
  getClientApplications,
  getClientProject,
  getClientRoadmapData,
} from '@/lib/client-data'
import { ClientTopNav } from './ClientTopNav'
import { DashboardHero } from './DashboardHero'
import { OnboardingTour } from './OnboardingTour'
import { ProjectAndRoadmap } from './ProjectAndRoadmap'
import { ShortlistBlock } from './ShortlistBlock'
import { ApplicationsBlock } from './ApplicationsBlock'
import { EssayCards } from './EssayCards'
import { DocumentsSection } from './DocumentsSection'
import { PreviewBanner } from './PreviewBanner'
import {
  CLIENT_CTX,
  ESSAYS,
  REQUIRED_DOCS,
} from './mock-data'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

export default async function ClientHomePage({ searchParams }: { searchParams: Promise<{ clientId?: string; onboarding?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  const role = profile?.role

  const params = await searchParams
  const requestedClientId = params.clientId ? Number(params.clientId) : undefined

  const client = await resolveClientForViewer({
    userId: user.id,
    userEmail: user.email || '',
    role,
    requestedClientId,
  })

  if (!client) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--ds-bg)', padding: '80px 32px', maxWidth: 720, margin: '0 auto' }}>
        <ClientTopNav userName={user.email || ''} activePage="home" />
        <div className="ds-card" style={{ padding: 40, marginTop: 40 }}>
          <h1 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 28, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Кабинет не настроен
          </h1>
          <p style={{ marginTop: 12, color: 'var(--ds-ink-dim)', lineHeight: 1.5 }}>
            Твой email <b>{user.email}</b> не привязан к клиентской записи. Напиши куратору — он привяжет.
          </p>
        </div>
      </div>
    )
  }

  const [timeline, universities, documentRows, essayRows, applications, projectData, roadmapData] = await Promise.all([
    getClientTimeline(client.id),
    getClientUniversities(client.id),
    getClientDocumentRows(client.id),
    getClientEssays(client.id),
    getClientApplications(client.id),
    getClientProject(client.id),
    getClientRoadmapData(client.id),
  ])

  // Derive essay state for EssayCards (maps DB status → mock EssayState)
  const essayStateMap: Record<string, 'not_started' | 'in_progress' | 'sent' | 'editing' | 'ready'> = {
    draft: 'in_progress',
    sent: 'sent',
    editing: 'editing',
    approved: 'ready',
  }
  const essaysWithState = ESSAYS.map(e => {
    const dbType = e.key === 'resume' ? 'resume' : e.key === 'motivation' ? 'motivation' : null
    const row = dbType ? essayRows.find(r => r.type === dbType) : null
    return row
      ? { ...e, state: essayStateMap[row.status] || 'in_progress', updatedAt: row.last_updated_at?.slice(0, 10) }
      : e
  })

  // Resume & motivation are virtual docs — backed by client_essays
  const resumeEssay = essayRows.find(r => r.type === 'resume')
  const motivationEssay = essayRows.find(r => r.type === 'motivation')
  const previewId = requestedClientId ? `?clientId=${requestedClientId}` : ''

  // Real uploaded files from client_documents, keyed by doc_type
  const uploadedByType = new Map(documentRows.map(d => [d.doc_type, d]))

  const requiredDocs = REQUIRED_DOCS.map(tpl => {
    if (tpl.key === 'resume') {
      if (resumeEssay?.status === 'approved') {
        return { ...tpl, status: 'uploaded' as const, href: `/client/resume${previewId}`, fileName: 'Резюме — финал', hint: 'Готово, куратор утвердил. Открой чтобы посмотреть или распечатать в PDF.' }
      }
      if (resumeEssay?.status === 'sent' || resumeEssay?.status === 'editing') {
        return { ...tpl, status: 'pending' as const, href: `/client/resume${previewId}`, hint: 'Отправлено куратору, ждёт финал' }
      }
      return { ...tpl, status: 'missing' as const, href: `/client/resume${previewId}`, hint: 'Заполни резюме и отправь куратору', lockedHint: undefined }
    }
    if (tpl.key === 'motivation') {
      if (motivationEssay?.status === 'approved') {
        return { ...tpl, status: 'uploaded' as const, href: `/client/motivation${previewId}`, fileName: 'Мотивационное письмо — финал', hint: 'Готово, куратор утвердил. Открой чтобы посмотреть или распечатать в PDF.' }
      }
      if (motivationEssay?.status === 'sent' || motivationEssay?.status === 'editing') {
        return { ...tpl, status: 'pending' as const, href: `/client/motivation${previewId}`, hint: 'Отправлено куратору, ждёт финал' }
      }
      return { ...tpl, status: 'missing' as const, href: `/client/motivation${previewId}`, hint: 'Заполни письмо и отправь куратору', lockedHint: undefined }
    }
    const uploaded = uploadedByType.get(tpl.key)
    if (uploaded?.storage_path) {
      return {
        ...tpl,
        status: 'uploaded' as const,
        fileName: uploaded.file_name || undefined,
        fileSize: uploaded.file_size_bytes ? formatBytes(uploaded.file_size_bytes) : undefined,
      }
    }
    return tpl
  })
  // Optional uploads — все записи с doc_type='optional'
  const optionalUploads = documentRows.filter(d => d.doc_type === 'optional' && d.storage_path)

  const displayName = client.name || user.email || CLIENT_CTX.parentName
  const isPreview = role !== 'client'

  // Онбординг показываем если: 1) клиент сам не прошёл (clients.onboarded=false)
  //   и 2) это его настоящий вход (не preview-куратор/админ).
  //   ?onboarding=1 в URL форсит показ (пришёл с /invite активации).
  const showOnboarding = !isPreview && (params.onboarding === '1' || !client.onboarded)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg)' }}>
      {isPreview && <PreviewBanner clientName={client.name || 'клиент'} clientId={client.id} />}
      {showOnboarding && <OnboardingTour clientId={client.id} />}
      <ClientTopNav userName={displayName} activePage="home" />

      <div data-tour="timeline">
        <DashboardHero
          ctx={{
            ...CLIENT_CTX,
            parentName: client.name || CLIENT_CTX.parentName,
            childFirstName: (client as any).first_name || (client.name || '').split(' ')[0] || CLIENT_CTX.childFirstName,
            childFullName: client.name || CLIENT_CTX.childFullName,
          }}
          stages={timeline}
        />
      </div>

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
        <ProjectAndRoadmap clientId={client.id} project={projectData} roadmap={roadmapData} />
        <div data-tour="shortlist">
          <ShortlistBlock items={universities} total={universities.length} clientId={client.id} />
        </div>
        <ApplicationsBlock applications={applications} previewQuery={previewId} />
        <div data-tour="essays">
          <EssayCards essays={essaysWithState} />
        </div>
        <div data-tour="documents">
          <DocumentsSection
            required={requiredDocs}
            optionalUploads={optionalUploads}
            clientId={client.id}
            requiredRowsByType={Object.fromEntries(documentRows.filter(d => d.doc_type !== 'optional').map(d => [d.doc_type, d]))}
          />
        </div>
      </main>
    </div>
  )
}
