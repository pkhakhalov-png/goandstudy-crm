import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createParserClient } from '@/lib/supabase/parser'
import { CuratorSidebar } from '../CuratorSidebar'
import { UniversityFilters } from './UniversityFilters'

const PAGE_SIZE = 24

const COUNTRY_LABEL: Record<string, string> = {
  ca: 'Канада',
  au: 'Австралия',
  gb: 'Великобритания',
  de: 'Германия',
  us: 'США',
}

type Search = { country?: string; search?: string; page?: string }

export default async function UniversitiesPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const params = await searchParams
  const country = params.country?.trim().toLowerCase() || ''
  const search = params.search?.trim() || ''
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') redirect('/login')

  const parser = createParserClient()

  // Уникальные country_code для дропдауна
  const { data: allCountryRows } = await parser.from('schools').select('country_code').limit(2000)
  const countryCodes = Array.from(
    new Set((allCountryRows ?? []).map(r => (r.country_code || '').toLowerCase()).filter(Boolean))
  ).sort()

  // Основной запрос
  const offset = (page - 1) * PAGE_SIZE
  let query = parser
    .from('schools')
    .select('id, name, city, country_code, logo_url, avg_tuition, top_disciplines', { count: 'exact' })
    .order('name')
    .range(offset, offset + PAGE_SIZE - 1)

  if (country) query = query.eq('country_code', country)
  if (search) query = query.or(`name.ilike.%${search}%,city.ilike.%${search}%`)

  const { data: schools, count, error: schoolsError } = await query
  if (schoolsError) {
    console.error('[curator/universities] schools query error:', schoolsError)
  }
  if (!process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL) {
    console.error('[curator/universities] NEXT_PUBLIC_PARSER_SUPABASE_URL is not set')
  }
  if (!process.env.NEXT_PUBLIC_PARSER_SUPABASE_ANON_KEY) {
    console.error('[curator/universities] NEXT_PUBLIC_PARSER_SUPABASE_ANON_KEY is not set')
  }
  console.log('[curator/universities]', {
    parserUrl: process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL,
    anonKeyLen: process.env.NEXT_PUBLIC_PARSER_SUPABASE_ANON_KEY?.length,
    count, returnedRows: schools?.length, error: schoolsError?.message,
  })

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const initials = (profile?.name || user.email || 'КР')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <CuratorSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="universities" />
      <div className="main">
        <div className="topbar">
          <div className="pt">База вузов</div>
          <div className="tbr">
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {total > 0 ? `Найдено ${total.toLocaleString('ru')} вузов` : 'Ничего не найдено'}
            </span>
          </div>
        </div>

        <div style={{ padding: '20px 28px' }}>
          <UniversityFilters
            countryCodes={countryCodes}
            countryLabels={COUNTRY_LABEL}
            initialCountry={country}
            initialSearch={search}
          />

          {(schools ?? []).length === 0 ? (
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
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              }}>
                {(schools ?? []).map(school => (
                  <UniversityCard key={school.id} school={school} />
                ))}
              </div>

              {totalPages > 1 && (
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  country={country}
                  search={search}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function UniversityCard({ school }: { school: any }) {
  const countryLabel = COUNTRY_LABEL[(school.country_code || '').toLowerCase()] || (school.country_code || '').toUpperCase()
  const topDisc = Array.isArray(school.top_disciplines) ? school.top_disciplines : []
  const totalPrograms = topDisc.reduce((sum: number, d: any) => sum + (Number(d?.count) || 0), 0)

  return (
    <Link
      href={`/curator/universities/${school.id}`}
      style={{
        display: 'block',
        background: 'var(--surf)',
        border: '1px solid var(--bor)',
        borderRadius: 14,
        padding: 16,
        textDecoration: 'none',
        color: 'var(--text)',
        boxShadow: 'var(--sh)',
        transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
      }}
      className="uni-card"
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
        <LogoBlock logoUrl={school.logo_url} name={school.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: 'var(--text)',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', lineHeight: 1.3,
          }}>
            {school.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            {countryLabel}{school.city ? `, ${school.city}` : ''}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 6, fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
        {totalPrograms > 0 && (
          <div>🎓 <span style={{ color: 'var(--text)', fontWeight: 600 }}>{totalPrograms}</span> программ</div>
        )}
        {school.avg_tuition != null && (
          <div>💵 Средняя цена: <span style={{ color: 'var(--text)', fontWeight: 600 }}>
            {Math.round(Number(school.avg_tuition)).toLocaleString('ru')}
          </span> /год</div>
        )}
      </div>

      <div style={{
        fontSize: 12, fontWeight: 600, color: 'var(--purple)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        Посмотреть программы <span>→</span>
      </div>
    </Link>
  )
}

function LogoBlock({ logoUrl, name }: { logoUrl?: string | null; name: string }) {
  const letter = (name || '?').trim()[0]?.toUpperCase() || '?'
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        style={{
          width: 48, height: 48, borderRadius: 10, objectFit: 'contain',
          background: '#fff', border: '1px solid var(--bor)',
          flexShrink: 0,
        }}
      />
    )
  }
  return (
    <div style={{
      width: 48, height: 48, borderRadius: 10, flexShrink: 0,
      background: 'var(--purple)', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 18, fontWeight: 700,
    }}>
      {letter}
    </div>
  )
}

function Pagination({
  currentPage, totalPages, country, search,
}: { currentPage: number; totalPages: number; country: string; search: string }) {
  function href(p: number) {
    const qs = new URLSearchParams()
    if (country) qs.set('country', country)
    if (search) qs.set('search', search)
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
