import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createParserClient } from '@/lib/supabase/parser'
import { createScholarshipsClient } from '@/lib/supabase/scholarships'
import { CuratorSidebar } from '../../CuratorSidebar'
import { SchoolTabs } from './SchoolTabs'
import { FillSchoolButton } from './FillSchoolButton'
import { SchoolHeaderLogo } from './SchoolHeaderLogo'
import { SchoolHeroPhoto } from './SchoolHeroPhoto'
import { BackButton } from './BackButton'

const COUNTRY_LABEL: Record<string, string> = {
  ca: 'Канада', au: 'Австралия', gb: 'Великобритания', de: 'Германия', us: 'США',
}

export default async function SchoolPage({
  params,
  searchParams,
}: {
  params: Promise<{ schoolId: string }>
  searchParams: Promise<{ asClient?: string; clientId?: string }>
}) {
  const { schoolId } = await params
  const sp = await searchParams
  const asClient = sp.asClient === '1'
  const id = Number(schoolId)
  if (!id) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  // Клиенту разрешено заходить на детали школы в read-only (asClient=1)
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop' && profile?.role !== 'client') redirect('/login')

  const parser = createParserClient()
  const [{ data: school }, { data: programs }] = await Promise.all([
    parser.from('schools').select('*').eq('id', id).maybeSingle(),
    parser.from('programs').select('id, name, tuition, application_fee, raw_data').eq('school_id', id).order('name'),
  ])

  if (!school) notFound()

  // Стипендии: IDP по school_id + TopUni по institution_title (best-effort, ilike)
  const sch = createScholarshipsClient()
  const today = new Date().toISOString().slice(0, 10)
  const [{ data: idpScholarships }, { data: topuniScholarships }] = await Promise.all([
    sch.from('idp_scholarships')
      .select('id, idp_url, name, level, funding_type, value_amount, value_currency, value_text, application_deadline, country_code')
      .eq('school_id', id)
      .or(`application_deadline.is.null,application_deadline.gte.${today}`)
      .order('application_deadline', { ascending: true, nullsFirst: false })
      .limit(50),
    sch.from('scholarships_topuni')
      .select('scholarship_id, title, institution_title, study_levels, amount_text, amount_type, deadline, is_exclusive')
      .eq('archived', false)
      .ilike('institution_title', school.name)
      .or(`deadline.is.null,deadline.gte.${today}`)
      .order('deadline', { ascending: true, nullsFirst: false })
      .limit(50),
  ])

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
      {!asClient && (
        <CuratorSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="universities" />
      )}
      <div className="main">
        <div className="topbar" style={{ gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="pt" style={{
              display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>{school.name}</span>
          </div>
        </div>

        <div style={{ padding: '20px 28px 40px' }}>
          {/* Hero-фото кампуса от ИИ (если 404 — клиент-компонент сам спрячет) */}
          {school.campus_photo_url && (
            <SchoolHeroPhoto src={school.campus_photo_url} name={school.name} />
          )}

          {/* Шапка */}
          <div style={{
            display: 'flex', gap: 16, alignItems: 'flex-start',
            background: 'var(--surf)', border: '1px solid var(--bor)', borderRadius: 14,
            padding: 20, marginBottom: 16, boxShadow: 'var(--sh)',
          }}>
            <SchoolHeaderLogo src={school.logo_url} name={school.name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, lineHeight: 1.2, flex: 1, minWidth: 0 }}>{school.name}</h1>
                {school.qs_rank && school.qs_rank > 0 && school.qs_rank < 999 && (
                  <div title="Позиция в QS World University Rankings" style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    padding: '6px 12px', borderRadius: 10,
                    background: 'rgba(177,94,204,.08)', border: '1px solid rgba(177,94,204,.3)',
                    color: 'var(--purple)', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8 }}>QS</span>
                    <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>#{school.qs_rank}</span>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>📍 {countryLabel}{school.province ? `, ${school.province}` : ''}{school.city ? `, ${school.city}` : ''}</span>
                {school.address && <span>{school.address}</span>}
                {(school.postal_code || raw.postal_code) && <span>{school.postal_code || raw.postal_code}</span>}
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(school.university_type || school.institution_type || raw.institution_type) && (
                  <span className="ctag">{school.university_type || school.institution_type || raw.institution_type}</span>
                )}
                {(school.founded_in || raw.founded_in) && (
                  <span className="ctag" style={{ background: 'rgba(22,163,97,.08)', color: 'var(--green)', borderColor: 'rgba(22,163,97,.2)' }}>
                    Основан в {school.founded_in || raw.founded_in}
                  </span>
                )}
                {school.pgwp_programs_count != null && school.pgwp_programs_count > 0 && (
                  <span className="ctag" style={{ background: 'rgba(0,136,204,.08)', color: '#0088cc', borderColor: 'rgba(0,136,204,.2)' }}>
                    PGWP × {school.pgwp_programs_count}
                  </span>
                )}
              </div>
              {school.curator_note && (
                <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.5, color: 'var(--text)', background: 'rgba(177,94,204,.06)', borderLeft: '3px solid var(--purple)', padding: '10px 12px', borderRadius: 4 }}>
                  {school.curator_note}
                </div>
              )}
              {!asClient && (
                <div style={{ marginTop: 12 }}>
                  <FillSchoolButton schoolId={school.id} hasData={!!(school.qs_rank || school.curator_note || school.university_type)} />
                </div>
              )}
            </div>
          </div>

          {/* Карта */}
          {(school.latitude && school.longitude) || school.address ? (
            <SchoolMap
              latitude={school.latitude}
              longitude={school.longitude}
              address={school.address}
              name={school.name}
              city={school.city}
              countryCode={school.country_code}
            />
          ) : null}

          {/* Галерея фотографий временно убрана — пока AI-шаблон не утверждён */}

          <SchoolTabs
            school={school}
            programs={programs ?? []}
            myClients={myClients ?? []}
            asClient={asClient}
            clientId={sp.clientId}
            idpScholarships={idpScholarships ?? []}
            topuniScholarships={topuniScholarships ?? []}
          />
        </div>
      </div>
    </div>
  )
}


function SchoolMap({ latitude, longitude, address, name, city, countryCode }: {
  latitude: number | null
  longitude: number | null
  address: string | null
  name: string
  city: string | null
  countryCode: string | null
}) {
  // Всегда Google Maps. ВСЕГДА строим запрос по имени вуза + адресу/городу/стране,
  // даже если есть координаты — так Google показывает «карточку места» (название
  // на пине, фото, рейтинг), а не просто точку в воздухе.
  // Координаты используем как уточнение через @lat,lng,zoom если есть.
  const queryParts = [name, address, city, countryCode?.toUpperCase()].filter(Boolean)
  const queryStr = queryParts.join(', ')
  const q = encodeURIComponent(queryStr)

  let embedUrl: string
  let mapLink: string
  if (latitude && longitude) {
    // ll= даёт центр карты, q= — поиск места. Google найдёт вуз по имени и поставит маркер,
    // если имя совпадёт — лучше чем просто точка по lat/lng.
    const lat = Number(latitude)
    const lon = Number(longitude)
    embedUrl = `https://www.google.com/maps?q=${q}&ll=${lat},${lon}&z=16&output=embed`
    mapLink = `https://www.google.com/maps/search/?api=1&query=${q}`
  } else {
    embedUrl = `https://www.google.com/maps?q=${q}&output=embed`
    mapLink = `https://www.google.com/maps/search/?api=1&query=${q}`
  }

  return (
    <div style={{
      background: 'var(--surf)', border: '1px solid var(--bor)', borderRadius: 14,
      padding: 0, marginBottom: 16, boxShadow: 'var(--sh)', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--bor)' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 4 }}>
            Локация
          </div>
          <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
            {address || [city, countryCode?.toUpperCase()].filter(Boolean).join(', ')}
          </div>
        </div>
        <a
          href={mapLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12, color: 'var(--purple)', textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          Открыть на карте ↗
        </a>
      </div>
      <iframe
        src={embedUrl}
        style={{ width: '100%', height: 320, border: 0, display: 'block' }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        title={`Карта · ${name}`}
      />
    </div>
  )
}
