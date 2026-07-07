import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createParserClient } from '@/lib/supabase/parser'
import { searchPrograms } from '@/lib/catalog-search'
import { CuratorSidebar } from '../CuratorSidebar'
import { UniversityFilters } from './UniversityFilters'
import { ProgramCardInteractive } from './ProgramCard'

const PAGE_SIZE = 24

const COUNTRY_LABEL: Record<string, string> = {
  us: 'США', gb: 'Великобритания', ca: 'Канада', au: 'Австралия',
  de: 'Германия', fr: 'Франция', it: 'Италия', es: 'Испания',
  nl: 'Нидерланды', at: 'Австрия', ie: 'Ирландия', ae: 'ОАЭ', hu: 'Венгрия',
  pt: 'Португалия', si: 'Словения', tr: 'Турция',
}

type SortKey = 'name_asc' | 'price_asc' | 'price_desc' | 'recent'

type Search = {
  q?: string
  country?: string
  school?: string
  levels?: string
  intakes?: string
  sort?: string
  page?: string
  specialty?: string
  uniType?: string
  budget?: string
  langOnly?: string
}

export const dynamic = 'force-dynamic'

export default async function UniversitiesPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const params = await searchParams
  const q = params.q?.trim() || ''
  const country = params.country?.trim().toLowerCase() || ''
  const schoolFilter = params.school?.trim() || ''
  const levels = (params.levels || '').split(',').map(s => s.trim()).filter(Boolean)
  const intakeYears = (params.intakes || '').split(',').map(s => s.trim()).filter(Boolean)
  const sort = (params.sort as SortKey) || 'name_asc'
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1)
  const specialty = params.specialty?.trim() || ''
  const uniType = params.uniType?.trim() || ''
  const budget = params.budget?.trim() || ''
  const languageOnly = params.langOnly === '1'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') redirect('/login')

  const parser = createParserClient()

  const offset = (page - 1) * PAGE_SIZE

  // RPC search_programs — единый Postgres-запрос с total + rows.
  // (см. supabase/parser-search-rpc.sql)
  const searchResult = await searchPrograms({
    country: country || undefined,
    schoolId: schoolFilter ? Number(schoolFilter) : undefined,
    specialty: specialty || undefined,
    uniType: uniType || undefined,
    budget: budget || undefined,
    levels,
    intakeYears,
    search: q || undefined,
    sort,
    limit: PAGE_SIZE,
    offset,
    languageOnly,
  })

  // Подгружаем все школы постранично (Supabase лимит 1000 на запрос) — для дропдауна вузов
  const allSchoolsForFilters: { id: number; name: string; country_code: string | null }[] = []
  for (let off = 0; off < 10000; off += 1000) {
    const { data } = await parser.from('schools').select('id, name, country_code').order('name').range(off, off + 999)
    if (!data || data.length === 0) break
    allSchoolsForFilters.push(...(data as any[]))
    if (data.length < 1000) break
  }
  const schoolsList = allSchoolsForFilters

  // Считаем количество ПРОГРАММ по странам — без inner-join (на проде он давал ложные count=0).
  // Группируем school_id по country_code один раз, потом считаем programs с .in() по списку id.
  const COUNTRY_CODES_FOR_COUNT = ['us', 'gb', 'ca', 'de', 'fr', 'it', 'es', 'nl', 'at', 'au', 'ie', 'ae', 'hu', 'pt', 'si', 'tr']
  const idsByCountry = new Map<string, number[]>()
  for (const s of schoolsList) {
    const cc = (s.country_code || '').toLowerCase()
    if (!cc) continue
    if (!idsByCountry.has(cc)) idsByCountry.set(cc, [])
    idsByCountry.get(cc)!.push(s.id)
  }
  const countResults = await Promise.allSettled(
    COUNTRY_CODES_FOR_COUNT.map(async c => {
      const ids = idsByCountry.get(c) || []
      if (ids.length === 0) return { code: c, count: 0 }
      const r = await parser.from('programs')
        .select('id', { count: 'exact', head: true })
        .in('school_id', ids)
      return { code: c, count: r.count || 0 }
    })
  )
  const countryCounts: Record<string, number> = {}
  for (const r of countResults) {
    if (r.status === 'fulfilled') countryCounts[r.value.code] = r.value.count
  }

  const programs = searchResult.rows
  const count = searchResult.total
  const totalCapped = searchResult.totalCapped || false
  // Список стран — сначала те что в нашем COUNTRY_LABEL (известный порядок), потом остальные
  const known = Object.keys(COUNTRY_LABEL).filter(c => countryCounts[c])
  const others = Object.keys(countryCounts).filter(c => !COUNTRY_LABEL[c]).sort()
  const countryCodes = [...known, ...others]

  // Специальности (из импортированных через GitHub + классификации)
  const SPECIALTY_OPTIONS = [
    'Бизнес и управление', 'IT и технологии', 'Экономика и финансы', 'Инженерия',
    'Медицина и здоровье', 'Право', 'Дизайн и искусство', 'Гуманитарные науки',
    'Естественные науки', 'Социальные науки', 'Образование', 'Медиа и коммуникации',
    'Туризм и гостиничный', 'Архитектура', 'Языковые курсы', 'Другое',
  ]

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
        <section className="ds-hero">
          <div className="ds-hero-inner">
            <div className="ds-hero-eyebrow">Каталог программ</div>
            <h1 className="ds-hero-h1">
              База <span className="ds-hl">вузов</span> и программ
            </h1>
            <p className="ds-hero-sub">
              Поиск по зарубежным университетам. Фильтры по стране, уровню и intake. Найденную программу можно добавить клиенту в shortlist одной кнопкой.
            </p>
            <div className="ds-hero-stats">
              <div>
                <span className="ds-stat-num">{total.toLocaleString('ru')}{totalCapped ? '+' : ''}</span>
                <span className="ds-stat-label">
                  {total === 1 ? 'программа найдена' : total >= 2 && total <= 4 ? 'программы найдено' : 'программ найдено'}
                </span>
              </div>
            </div>
          </div>
        </section>

        <div style={{ padding: '28px 32px 48px' }}>
          <UniversityFilters
            countryCodes={countryCodes}
            countryLabels={COUNTRY_LABEL}
            countryCounts={countryCounts}
            schools={schoolsList ?? []}
            specialtyOptions={SPECIALTY_OPTIONS}
            initial={{ q, country, school: schoolFilter, levels, intakeYears, sort, specialty, uniType, budget, langOnly: languageOnly }}
          />

          {(programs ?? []).length === 0 ? (
            <div className="ds-empty" style={{ marginTop: 28 }}>
              <div className="ds-empty-title">Ничего не найдено</div>
              Попробуй изменить фильтры или сбросить поиск.
            </div>
          ) : (
            <>
              <div style={{
                marginTop: 20,
                display: 'grid',
                gap: 20,
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
                  levels={levels}
                  intakeYears={intakeYears}
                  sort={sort}
                  specialty={specialty}
                  uniType={uniType}
                  budget={budget}
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
  currentPage, totalPages, q, country, school, levels, intakeYears, sort, specialty, uniType, budget,
}: {
  currentPage: number; totalPages: number;
  q: string; country: string; school: string;
  levels: string[]; intakeYears: string[]; sort: string;
  specialty: string; uniType: string; budget: string;
}) {
  function href(p: number) {
    const qs = new URLSearchParams()
    if (q) qs.set('q', q)
    if (country) qs.set('country', country)
    if (school) qs.set('school', school)
    if (levels.length > 0) qs.set('levels', levels.join(','))
    if (intakeYears.length > 0) qs.set('intakes', intakeYears.join(','))
    if (sort && sort !== 'name_asc') qs.set('sort', sort)
    if (specialty) qs.set('specialty', specialty)
    if (uniType) qs.set('uniType', uniType)
    if (budget) qs.set('budget', budget)
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

  return (
    <div className="ds-pag">
      {currentPage > 1 && <Link href={href(currentPage - 1)} className="ds-pag-btn">‹</Link>}
      {start > 1 && <>
        <Link href={href(1)} className="ds-pag-btn">1</Link>
        {start > 2 && <span className="ds-pag-ellipsis">…</span>}
      </>}
      {pages.map(p => (
        <Link
          key={p}
          href={href(p)}
          className={`ds-pag-btn${p === currentPage ? ' active' : ''}`}
        >
          {p}
        </Link>
      ))}
      {end < totalPages && <>
        {end < totalPages - 1 && <span className="ds-pag-ellipsis">…</span>}
        <Link href={href(totalPages)} className="ds-pag-btn">{totalPages}</Link>
      </>}
      {currentPage < totalPages && <Link href={href(currentPage + 1)} className="ds-pag-btn">›</Link>}
    </div>
  )
}
