import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createParserClient, schoolPhotoUrl } from '@/lib/supabase/parser'
import { CuratorSidebar } from '../../CuratorSidebar'
import { SchoolTabs } from './SchoolTabs'

const COUNTRY_LABEL: Record<string, string> = {
  ca: 'Канада', au: 'Австралия', gb: 'Великобритания', de: 'Германия', us: 'США',
}

export default async function SchoolPage({
  params,
}: {
  params: Promise<{ schoolId: string }>
}) {
  const { schoolId } = await params
  const id = Number(schoolId)
  if (!id) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') redirect('/login')

  const parser = createParserClient()
  const [{ data: school }, { data: photos }, { data: programs }] = await Promise.all([
    parser.from('schools').select('*').eq('id', id).maybeSingle(),
    parser.from('school_photos').select('id, storage_path, photo_type').eq('school_id', id).limit(5),
    parser.from('programs').select('id, name, tuition, application_fee, raw_data').eq('school_id', id).order('name'),
  ])

  if (!school) notFound()

  // Клиенты этого куратора — для дропдауна "Добавить клиенту"
  const admin = await createAdminClient()
  const { data: curatorRec } = await admin
    .from('curators').select('id').eq('user_id', user.id).maybeSingle()
  const curatorId = curatorRec?.id

  const { data: myClients } = curatorId
    ? await admin
        .from('clients')
        .select('id, name, country')
        .eq('curator_id', curatorId)
        .eq('status', 'active')
        .order('name')
    : { data: [] as any[] }

  const initials = (profile?.name || user.email || 'КР')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  const countryLabel = COUNTRY_LABEL[(school.country_code || '').toLowerCase()]
    || (school.country_code || '').toUpperCase()

  const raw = (school.raw_data as any)?.attributes || {}

  return (
    <div className="app">
      <CuratorSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="universities" />
      <div className="main">
        <div className="topbar" style={{ gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/curator/universities" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 13 }}>
              &larr; База вузов
            </Link>
            <span style={{ color: 'var(--bor2)' }}>/</span>
            <span className="pt" style={{
              display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>{school.name}</span>
          </div>
        </div>

        <div style={{ padding: '20px 28px 40px' }}>
          {/* Шапка */}
          <div style={{
            display: 'flex', gap: 16, alignItems: 'flex-start',
            background: 'var(--surf)', border: '1px solid var(--bor)', borderRadius: 14,
            padding: 20, marginBottom: 16, boxShadow: 'var(--sh)',
          }}>
            {school.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={school.logo_url}
                alt={school.name}
                style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'contain', background: '#fff', border: '1px solid var(--bor)', flexShrink: 0 }}
              />
            ) : (
              <div style={{
                width: 72, height: 72, borderRadius: 12, flexShrink: 0,
                background: 'var(--purple)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, fontWeight: 700,
              }}>
                {school.name[0]?.toUpperCase() || '?'}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{school.name}</h1>
              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>📍 {countryLabel}{school.city ? `, ${school.city}` : ''}</span>
                {school.address && <span>{school.address}</span>}
                {raw.postal_code && <span>{raw.postal_code}</span>}
              </div>
              {raw.institution_type && (
                <div style={{ marginTop: 10 }}>
                  <span className="ctag">{raw.institution_type}</span>
                </div>
              )}
            </div>
          </div>

          {/* Галерея */}
          {(photos ?? []).length > 0 && (
            <SchoolPhotoGallery photos={(photos ?? []).map(p => ({ id: p.id, url: schoolPhotoUrl(p.storage_path) }))} />
          )}

          <SchoolTabs
            school={school}
            programs={programs ?? []}
            myClients={myClients ?? []}
          />
        </div>
      </div>
    </div>
  )
}

function SchoolPhotoGallery({ photos }: { photos: { id: string; url: string }[] }) {
  if (photos.length === 0) return null
  const main = photos[0]
  const rest = photos.slice(1, 5)

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: rest.length > 0 ? '2fr 1fr' : '1fr',
      gap: 8,
      marginBottom: 16,
      height: 320,
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={main.url} alt="" style={{
        width: '100%', height: '100%', objectFit: 'cover',
        borderRadius: 14, border: '1px solid var(--bor)',
      }} />
      {rest.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: rest.length >= 2 ? '1fr 1fr' : '1fr',
          gridTemplateRows: rest.length >= 3 ? '1fr 1fr' : '1fr',
          gap: 8,
        }}>
          {rest.map(p => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={p.url} alt="" style={{
              width: '100%', height: '100%', objectFit: 'cover',
              borderRadius: 10, border: '1px solid var(--bor)', minHeight: 0,
            }} />
          ))}
        </div>
      )}
    </div>
  )
}
