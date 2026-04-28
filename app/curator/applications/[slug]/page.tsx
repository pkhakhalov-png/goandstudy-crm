import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { CuratorSidebar } from '../../CuratorSidebar'
import { getAllApplicationsForCurator } from '@/lib/client-data'
import { ApplicationsKanban } from './ApplicationsKanban'

export const dynamic = 'force-dynamic'

export default async function CuratorUniBoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') redirect('/login')

  const admin = await createAdminClient()
  const { data: curatorRecord } = await admin.from('curators').select('id').eq('user_id', user.id).maybeSingle()
  const curatorId = curatorRecord?.id || null

  const isPrivileged = profile?.role === 'admin' || profile?.role === 'rop'
  const allApps = await getAllApplicationsForCurator(isPrivileged ? null : curatorId)

  // Парсим slug: s-{schoolId} либо n-{encoded-name}
  let filtered: typeof allApps = []
  let title = ''
  let country: string | null = null

  if (slug.startsWith('s-')) {
    const schoolId = Number(slug.slice(2))
    if (!Number.isFinite(schoolId)) notFound()
    filtered = allApps.filter(a => a.school_id === schoolId)
  } else if (slug.startsWith('n-')) {
    const decoded = decodeURIComponent(slug.slice(2)).replace(/-/g, ' ').trim()
    filtered = allApps.filter(a => a.university_name.toLowerCase().startsWith(decoded.toLowerCase()))
  } else {
    notFound()
  }

  if (filtered.length === 0) {
    title = slug.startsWith('n-') ? decodeURIComponent(slug.slice(2)).replace(/-/g, ' ') : 'Вуз'
  } else {
    title = filtered[0].university_name
    country = filtered[0].country
  }

  const initials = (profile?.name || user.email || 'КР')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <CuratorSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="applications" />
      <div className="main" style={{ background: 'var(--ds-bg)' }}>
        <header style={{ borderBottom: '1px solid var(--ds-border-soft)', background: 'var(--ds-bg)' }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 32px 24px' }}>
            <Link
              href="/curator/applications"
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
              ← Все вузы
            </Link>
            <h1 style={{ fontFamily: 'var(--ds-font-display-stack)', fontWeight: 700, fontSize: 'clamp(24px, 3.5vw, 36px)', textTransform: 'uppercase', letterSpacing: '0.02em', margin: 0, lineHeight: 1.1 }}>
              {title}
            </h1>
            {country && (
              <div style={{ fontSize: 13, color: 'var(--ds-muted)', marginTop: 8 }}>{country} · {filtered.length} {filtered.length === 1 ? 'заявка' : filtered.length < 5 ? 'заявки' : 'заявок'}</div>
            )}
          </div>
        </header>

        <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 32px 80px' }}>
          {filtered.length === 0 ? (
            <div className="ds-card" style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: 'var(--ds-muted)' }}>В этот вуз пока никто не подавался.</div>
            </div>
          ) : (
            <ApplicationsKanban applications={filtered as any[]} />
          )}
        </main>
      </div>
    </div>
  )
}
