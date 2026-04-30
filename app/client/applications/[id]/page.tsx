import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  resolveClientForViewer,
  getApplication,
  getApplicationDocuments,
  getApplicationEvents,
  getClientDocumentRows,
  getClientEssays,
  clientHasUnlockedScholarships,
} from '@/lib/client-data'
import { ClientTopNav } from '@/app/client/ClientTopNav'
import { PreviewBanner } from '@/app/client/PreviewBanner'
import { ApplicationView } from './ApplicationView'

export const dynamic = 'force-dynamic'

export default async function ClientApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ clientId?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const requestedClientId = sp.clientId ? Number(sp.clientId) : undefined

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()

  const client = await resolveClientForViewer({
    userId: user.id,
    userEmail: user.email || '',
    role: profile?.role,
    requestedClientId,
  })
  if (!client) redirect('/client')

  const app = await getApplication(id)
  if (!app || app.client_id !== client.id) notFound()

  const [documents, events, globalDocs, essays, hasUnlockedScholarships] = await Promise.all([
    getApplicationDocuments(id),
    getApplicationEvents(id),
    getClientDocumentRows(client.id),
    getClientEssays(client.id),
    clientHasUnlockedScholarships(client.id),
  ])

  const isPreview = profile?.role !== 'client'
  const previewQuery = requestedClientId ? `?clientId=${requestedClientId}` : ''
  const isCurator = isPreview

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg)' }}>
      {isPreview && <PreviewBanner clientName={client.name || 'клиент'} clientId={client.id} />}
      <ClientTopNav userName={profile?.name || user.email || ''} activePage="home" showScholarships={hasUnlockedScholarships} />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 32px 80px' }}>
        <Link
          href={`/client${previewQuery}`}
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
            marginBottom: 20,
          }}
        >
          ← Вернуться в кабинет
        </Link>

        <ApplicationView
          app={app}
          documents={documents}
          events={events}
          isCurator={isCurator}
          clientId={client.id}
          globalDocs={globalDocs}
          essays={essays}
          previewQuery={previewQuery}
        />
      </div>
    </div>
  )
}
