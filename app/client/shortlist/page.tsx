import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveClientForViewer, getClientUniversities } from '@/lib/client-data'
import { ClientTopNav } from '../ClientTopNav'
import { PreviewBanner } from '../PreviewBanner'
import { ShortlistView } from './ShortlistView'
import { MAIN_PAGE_PRIORITY_LIMIT } from '../mock-data'

export default async function ClientShortlistPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
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

  const universities = await getClientUniversities(client.id)
  const isPreview = profile?.role !== 'client'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg)' }}>
      {isPreview && <PreviewBanner clientName={client.name || 'клиент'} clientId={client.id} />}
      <ClientTopNav userName={profile?.name || user.email || ''} activePage="shortlist" />

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
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '-20%',
            right: '-10%',
            width: 700,
            height: 400,
            background: 'radial-gradient(ellipse at center, rgba(232,184,68,0.12) 0%, transparent 65%)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '40px 32px 28px' }}>
          <Link
            href="/client"
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
            Подборка <span className="ds-hl">вузов</span>
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
            Куратор подготовил <b>{universities.length} программ</b> под твой проект.
            Отметь <b>приоритетные</b> — до 5 штук. На главной кабинета показываются первые {MAIN_PAGE_PRIORITY_LIMIT},
            в этом списке видны все отмеченные. Порядок можно поменять перетаскиванием или кнопками ↑ ↓.
          </p>
        </div>
      </section>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 32px 80px' }}>
        <ShortlistView items={universities} />
      </main>
    </div>
  )
}
