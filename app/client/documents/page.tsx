import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  resolveClientForViewer,
  getClientDocumentRows,
  getClientEssays,
  clientHasUnlockedScholarships,
} from '@/lib/client-data'
import { ClientTopNav } from '../ClientTopNav'
import { PreviewBanner } from '../PreviewBanner'
import { DocumentsSection } from '../DocumentsSection'
import { REQUIRED_DOCS, CLIENT_CTX } from '../mock-data'

export const dynamic = 'force-dynamic'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

export default async function ClientDocumentsPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  const params = await searchParams
  const requestedClientId = params.clientId ? Number(params.clientId) : undefined

  const client = await resolveClientForViewer({
    userId: user.id,
    userEmail: user.email || '',
    role: profile?.role,
    requestedClientId,
  })
  if (!client) redirect('/client')

  const [documentRows, essayRows, hasUnlockedScholarships] = await Promise.all([
    getClientDocumentRows(client.id),
    getClientEssays(client.id),
    clientHasUnlockedScholarships(client.id),
  ])

  const resumeEssay = essayRows.find(r => r.type === 'resume')
  const motivationEssay = essayRows.find(r => r.type === 'motivation')
  const previewId = requestedClientId ? `?clientId=${requestedClientId}` : ''
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

  const optionalUploads = documentRows.filter(d => d.doc_type === 'optional' && d.storage_path)
  const displayName = client.name || user.email || CLIENT_CTX.parentName
  const isPreview = profile?.role !== 'client'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg)' }}>
      {isPreview && <PreviewBanner clientName={client.name || 'клиент'} clientId={client.id} />}
      <ClientTopNav userName={displayName} activePage="documents" showScholarships={hasUnlockedScholarships} />

      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--ds-border-soft)', background: 'var(--ds-bg)' }}>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '-30%',
            left: '-10%',
            width: 1000,
            height: 600,
            background: 'radial-gradient(ellipse at center, rgba(181,127,207,0.18) 0%, transparent 65%)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '40px 32px 28px' }}>
          <Link
            href={`/client${previewId}`}
            style={{
              fontSize: 12,
              color: 'var(--ds-purple)',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 10,
            }}
          >
            ← Вернуться в кабинет
          </Link>
          <h1
            style={{
              fontFamily: 'var(--ds-font-display-stack)',
              fontWeight: 700,
              fontSize: 'clamp(32px, 4.5vw, 56px)',
              letterSpacing: '0.02em',
              lineHeight: 1,
              margin: '0 0 12px 0',
              textTransform: 'uppercase',
            }}
          >
            <span className="ds-hl">Документы</span>
          </h1>
          <p
            style={{
              fontSize: 16,
              color: 'var(--ds-ink-dim)',
              maxWidth: 720,
              lineHeight: 1.5,
              margin: 0,
              letterSpacing: '-0.005em',
            }}
          >
            Все документы для подачи: паспорт, аттестат, диплом, транскрипт, языковые сертификаты, рекомендации.
            Загружай — куратор увидит автоматически. Доп. документы — для всего, что не вошло в основной список.
          </p>
        </div>
      </section>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 32px 80px' }}>
        <DocumentsSection
          required={requiredDocs}
          optionalUploads={optionalUploads}
          clientId={client.id}
          requiredRowsByType={Object.fromEntries(documentRows.filter(d => d.doc_type !== 'optional').map(d => [d.doc_type, d]))}
        />
      </main>
    </div>
  )
}
