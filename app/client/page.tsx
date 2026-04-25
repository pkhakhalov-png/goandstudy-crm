import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

import {
  resolveClientForViewer,
  getClientTimeline,
  getClientUniversities,
  getClientDocuments,
  getClientEssays,
} from '@/lib/client-data'
import { ClientTopNav } from './ClientTopNav'
import { DashboardHero } from './DashboardHero'
import { ProjectAndRoadmap } from './ProjectAndRoadmap'
import { ShortlistBlock } from './ShortlistBlock'
import { EssayCards } from './EssayCards'
import { DocumentsSection } from './DocumentsSection'
import { PreviewBanner } from './PreviewBanner'
import {
  CLIENT_CTX,
  ROADMAP,
  STUDENT_PROJECT,
  ESSAYS,
  REQUIRED_DOCS,
  OPTIONAL_DOCS,
} from './mock-data'

export default async function ClientHomePage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
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

  const [timeline, universities, documents, essayRows] = await Promise.all([
    getClientTimeline(client.id),
    getClientUniversities(client.id),
    getClientDocuments(client.id),
    getClientEssays(client.id),
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

  // Merge DB docs with template (always show passport/academic/language/certificate/resume/motivation)
  const dbByKey = new Map(documents.map(d => [d.key, d]))
  const resumeEssay = essayRows.find(r => r.type === 'resume')
  const motivationEssay = essayRows.find(r => r.type === 'motivation')
  const previewId = requestedClientId ? `?clientId=${requestedClientId}` : ''

  const requiredDocs = REQUIRED_DOCS.map(tpl => {
    // Special-case: resume & motivation live in client_essays, not client_documents
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
    // Other doc types come from client_documents
    const db = dbByKey.get(tpl.key) || [...dbByKey.values()].find(d => d.title?.toLowerCase().includes(tpl.title.toLowerCase()))
    return db ? { ...tpl, status: db.status, hint: db.hint || tpl.hint } : tpl
  })
  const optionalDocs = OPTIONAL_DOCS

  const displayName = client.name || user.email || CLIENT_CTX.parentName
  const isPreview = role !== 'client'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg)' }}>
      {isPreview && <PreviewBanner clientName={client.name || 'клиент'} clientId={client.id} />}
      <ClientTopNav userName={displayName} activePage="home" />

      <DashboardHero
        ctx={{
          ...CLIENT_CTX,
          parentName: client.name || CLIENT_CTX.parentName,
          childFirstName: (client.name || '').split(' ')[0] || CLIENT_CTX.childFirstName,
          childFullName: client.name || CLIENT_CTX.childFullName,
        }}
        stages={timeline}
      />

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
        <ProjectAndRoadmap project={STUDENT_PROJECT} roadmap={ROADMAP} />
        <ShortlistBlock items={universities} total={universities.length} clientId={client.id} />
        <EssayCards essays={essaysWithState} />
        <DocumentsSection required={requiredDocs} optional={optionalDocs} />
      </main>
    </div>
  )
}
