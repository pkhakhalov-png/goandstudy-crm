import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  resolveClientForViewer,
  getApplication,
  getApplicationDocuments,
  getApplicationProfile,
  getApplicationProfileData,
  getClientEssays,
} from '@/lib/client-data'
import { ClientTopNav } from '@/app/client/ClientTopNav'
import { PreviewBanner } from '@/app/client/PreviewBanner'
import { WizardView } from './WizardView'

export const dynamic = 'force-dynamic'

export default async function ApplicationWizardPage({
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

  const { data: profileUser } = await supabase.from('users').select('name, role').eq('id', user.id).single()

  const client = await resolveClientForViewer({
    userId: user.id,
    userEmail: user.email || '',
    role: profileUser?.role,
    requestedClientId,
  })
  if (!client) redirect('/client')

  const app = await getApplication(id)
  if (!app || app.client_id !== client.id) notFound()

  if (!app.profile_id) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--ds-bg)', padding: 32 }}>
        <p style={{ color: 'var(--ds-text)' }}>У этой заявки нет привязки к паспорту вуза. Wizard недоступен.</p>
      </div>
    )
  }

  const [profileDef, profileData, documents, essays] = await Promise.all([
    getApplicationProfile(app.profile_id),
    getApplicationProfileData(id),
    getApplicationDocuments(id),
    getClientEssays(client.id),
  ])

  if (!profileDef) notFound()

  const isPreview = profileUser?.role !== 'client'
  const previewQuery = requestedClientId ? `?clientId=${requestedClientId}` : ''

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg)' }}>
      {isPreview && <PreviewBanner clientName={client.name || 'клиент'} clientId={client.id} />}
      <ClientTopNav userName={profileUser?.name || user.email || ''} activePage="home" />

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 32px 80px' }}>
        <Link
          href={`/client/applications/${id}${previewQuery}`}
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
          ← К заявке
        </Link>

        <WizardView
          app={app}
          profile={profileDef}
          profileData={profileData}
          documents={documents}
          essays={essays}
          clientName={client.name || ''}
          clientEmail={client.email || ''}
          isPreview={isPreview}
        />
      </div>
    </div>
  )
}
