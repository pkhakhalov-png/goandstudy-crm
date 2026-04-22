import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createParserClient } from '@/lib/supabase/parser'
import { CuratorSidebar } from '../CuratorSidebar'
import { UniversityFilters } from './UniversityFilters'
import { ProgramCardInteractive } from './ProgramCard'

const PAGE_SIZE = 24

const COUNTRY_LABEL: Record<string, string> = {
  ca: 'Канада', au: 'Австралия', gb: 'Великобритания', de: 'Германия',
  us: 'США', ie: 'Ирландия',
}

type SortKey = 'name_asc' | 'price_asc' | 'price_desc' | 'recent'

type Search = {
  q?: string
  country?: string
  school?: string
  sort?: string
  page?: string
}

export default async function UniversitiesPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const params = await searchParams
  const q = params.q?.trim() || ''
  const country = params.country?.trim().toLowerCase() || ''
  const schoolFilter = params.school?.trim() || ''
  const sort = (params.sort as SortKey) || 'name_asc'
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') redirect('/login')

  const parser = createParserClient()

  const offset = (page - 1) * PAGE_SIZE

  let query = parser
    .from('programs')
    .select(
      `
      id, name, tuition, application_fee, country_code, raw_data, school_id,
      school:schools(id, name, logo_url, country_code, city, institution_type)
      `,
      { count: 'exact' }
    )
    .range(offset, offset + PAGE_SIZE - 1)

  if (sort === 'price_asc') query = query.order('tuition', { ascending: true, nullsFirst: false })
  else if (sort === 'price_desc') query = query.order('tuition', { ascending: false, nullsFirst: false })
  else if (sort === 'recent') query = query.order('updated_at', { ascending: false })
  else query = query.order('name')

  if (country) query = query.eq('country_code', country)
  if (schoolFilter) query = query.eq('school_id', Number(schoolFilter))
  if (q) query = query.ilike('name', `%${q}%`)

  const [{ data: programs, count }, { data: schoolsList }, { data: countryRows }] = await Promise.all([
    query,
    parser.from('schools').select('id, name, country_code').order('name').limit(1000),
    parser.from('schools').select('country_code').limit(2000),
  ])

  const countryCodes = Array.from(
    new Set((countryRows ?? []).map(r => (r.country_code || '').toLowerCase()).filter(Boolean))
  ).sort()

  // Клиенты куратора — для кнопки «+ В подборку»
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
    : { data: [] as { id: number; name: string; country?: string | null }[] }

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const initials = (profile?.name || user.email || 'КР')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <CuratorSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="universities" />
      <div className="main">
        <div className="topbar">
          <div className="pt">База программ</div>
          <div className="tbr">
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {total > 0 ? `Найдено ${total.toLocaleString('ru')} программ` : 'Ничего не найдено'}
            </span>
          </div>
        </div>

        <div style={{ padding: '20px 28px 40px' }}>
          <UniversityFilters
            countryCodes={countryCodes}
            countryLabels={COUNTRY_LABEL}
            schools={schoolsList ?? []}
            initial={{ q, country, school: schoolFilter, sort }}
          />

          {(programs ?? []).length === 0 ? (
            <div style={{
              marginTop: 40, textAlign: 'center', padding: '48px 20px',
              color: 'var(--muted)', fontSize: 14,
              background: 'var(--surf)', border: '1px solid var(--bor)', borderRadius: 14,
            }}>
              Ничего не найдено. Попробуй изменить фильтры.
            </div>
          ) : (
            <>
              <div style={{
                marginTop: 16,
                display: 'grid',
                gap: 16,
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              }}>
                {(programs ?? []).map((prog) => (
                  <ProgramCardInteractive
                    key={prog.id}
                    program={prog}
                    myClients={myClients ?? []}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  q={q}
                  country={country}
                  school={schoolFilter}
                  sort={sort}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Pagination({
  currentPage, totalPages, q, country, school, sort,
}: {
  currentPage: number; totalPages: number; q: string; country: string; school: string; sort: string
}) {
  function href(p: number) {
    const qs = new URLSearchParams()
    if (q) qs.set('q', q)
    if (country) qs.set('country', country)
    if (school) qs.set('school', school)
    if (sort && sort !== 'name_asc') qs.set('sort', sort)
    if (p > 1) qs.set('page', String(p))
    const s = qs.toString()
    return s ? `/curator/universities?${s}` : '/curator/universities'
  }

  const pages: number[] = []
  const maxButtons = 7
  let start = Math.max(1, currentPage - 3)
  const end = Math.min(totalPages, start + maxButtons - 1)
  if (end - start < maxButtons - 1) start = Math.max(1, end - maxButtons + 1)
  for (let i = start; i <= end; i++) pages.push(i)

  const btnStyle = (active = false): React.CSSProperties => ({
    minWidth: 32,
    height: 32,
    padding: '0 10px',
    borderRadius: 8,
    border: `1px solid ${active ? 'var(--purple)' : 'var(--bor2)'}`,
    background: active ? 'var(--purple)' : 'var(--surf)',
    color: active ? '#fff' : 'var(--text)',
    fontSize: 12,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
  })

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
      {currentPage > 1 && <Link href={href(currentPage - 1)} style={btnStyle()}>‹</Link>}
      {start > 1 && <>
        <Link href={href(1)} style={btnStyle()}>1</Link>
        {start > 2 && <span style={{ color: 'var(--muted)', padding: '0 4px' }}>…</span>}
      </>}
      {pages.map(p => (
        <Link key={p} href={href(p)} style={btnStyle(p === currentPage)}>{p}</Link>
      ))}
      {end < totalPages && <>
        {end < totalPages - 1 && <span style={{ color: 'var(--muted)', padding: '0 4px' }}>…</span>}
        <Link href={href(totalPages)} style={btnStyle()}>{totalPages}</Link>
      </>}
      {currentPage < totalPages && <Link href={href(currentPage + 1)} style={btnStyle()}>›</Link>}
    </div>
  )
}
