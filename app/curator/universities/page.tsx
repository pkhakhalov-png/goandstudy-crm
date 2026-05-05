import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createParserClient } from '@/lib/supabase/parser'
import { CuratorSidebar } from '../CuratorSidebar'
import { UniversityFilters } from './UniversityFilters'
import { ProgramCardInteractive } from './ProgramCard'

const PAGE_SIZE = 24

const COUNTRY_LABEL: Record<string, string> = {
  us: 'США', gb: 'Великобритания', ca: 'Канада', au: 'Австралия',
  de: 'Германия', fr: 'Франция', it: 'Италия', es: 'Испания',
  nl: 'Нидерланды', at: 'Австрия', ie: 'Ирландия', ae: 'ОАЭ', hu: 'Венгрия',
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
  const levels = (params.levels || '').split(',').map(s => s.trim()).filter(Boolean)
  const intakeYears = (params.intakes || '').split(',').map(s => s.trim()).filter(Boolean)
  const sort = (params.sort as SortKey) || 'name_asc'
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1)
  const specialty = params.specialty?.trim() || ''
  const uniType = params.uniType?.trim() || ''
  const budget = params.budget?.trim() || ''

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') redirect('/login')

  const parser = createParserClient()

  const offset = (page - 1) * PAGE_SIZE

  // !inner нужен, чтобы фильтровать по school.country_code (у programs.country_code почти везде null)
  let query = parser
    .from('programs')
    .select(
      `
      id, name, tuition, application_fee, raw_data, school_id, specialty_group, source,
      degree_text, program_description, language_text, duration_text, start_date_text, deadline_text,
      tuition_text, living_cost_text, living_cost_period, scholarships_text, curator_note,
      school:schools!inner(id, name, logo_url, country_code, city, institution_type, qs_rank, university_type, curator_note)
      `,
      { count: 'exact' }
    )
    .range(offset, offset + PAGE_SIZE - 1)

  if (sort === 'price_asc') query = query.order('tuition', { ascending: true, nullsFirst: false })
  else if (sort === 'price_desc') query = query.order('tuition', { ascending: false, nullsFirst: false })
  else if (sort === 'recent') query = query.order('updated_at', { ascending: false })
  else query = query.order('name')

  // Страна — фильтр по embedded school (inner join)
  if (country) query = query.eq('school.country_code', country)
  if (schoolFilter) query = query.eq('school_id', Number(schoolFilter))
  if (q) query = query.ilike('name', `%${q}%`)
  if (specialty) query = query.eq('specialty_group', specialty)
  if (uniType) query = query.eq('school.university_type', uniType)
  // Бюджет (по программному tuition)
  if (budget === 'free') query = query.lt('tuition', 1000)
  else if (budget === 'low') query = query.lt('tuition', 10000).gte('tuition', 0)
  else if (budget === 'mid1') query = query.gte('tuition', 10000).lt('tuition', 25000)
  else if (budget === 'mid2') query = query.gte('tuition', 25000).lt('tuition', 50000)
  else if (budget === 'high') query = query.gte('tuition', 50000)
  // Уровень программы — кроссисточниковый фильтр.
  // applyboard заполняет raw_data.attributes.level стандартными кодами,
  // daad/curator_gh — нет. Поэтому делаем OR: structured-level OR name-heuristic.
  if (levels.length > 0) {
    const LEVEL_MAP: Record<string, { raw: string[]; nameKeywords: string[] }> = {
      bachelor: {
        raw: ['bachelors', '3_year_bachelors', 'integrated_masters', 'topup_degree', 'certificate', 'diploma', 'advanced_diploma'],
        nameKeywords: ['bachelor', 'undergrad', 'b.sc', 'b.a.', 'bsc', 'bachelorstudiengang'],
      },
      master: {
        raw: ['masters_degree', 'post_graduate_certificate', 'post_graduate_diploma'],
        nameKeywords: ['master', 'm.sc', 'm.a.', 'msc', 'mba', 'masterstudiengang'],
      },
      phd: {
        raw: ['doctoral_phd'],
        nameKeywords: ['phd', 'doctor', 'doctoral', 'promotion'],
      },
      language: {
        raw: ['english', 'non_credential'],
        nameKeywords: ['english', 'language course', 'esl'],
      },
    }
    const allRaw = new Set<string>()
    const allKw = new Set<string>()
    for (const l of levels) {
      const m = LEVEL_MAP[l]
      if (m) { m.raw.forEach(r => allRaw.add(r)); m.nameKeywords.forEach(k => allKw.add(k)) }
      else allRaw.add(l) // backwards-compat для старых URL
    }
    const orParts: string[] = []
    for (const r of allRaw) orParts.push(`raw_data->attributes->>level.eq.${r}`)
    for (const kw of allKw) orParts.push(`name.ilike.*${kw}*`)
    if (orParts.length > 0) query = query.or(orParts.join(','))
  }
  // Intake год — startsWith по JSONB пути; multi-год собираем через .or
  if (intakeYears.length > 0) {
    const orExpr = intakeYears
      .map(y => `raw_data->attributes->earliest_intake->>start_date.like.${y}%`)
      .join(',')
    query = query.or(orExpr)
  }

  // Подгружаем все школы постранично (Supabase лимит 1000 на запрос) — для дропдауна вузов
  const allSchoolsForFilters: { id: number; name: string; country_code: string | null }[] = []
  for (let off = 0; off < 10000; off += 1000) {
    const { data } = await parser.from('schools').select('id, name, country_code').order('name').range(off, off + 999)
    if (!data || data.length === 0) break
    allSchoolsForFilters.push(...(data as any[]))
    if (data.length < 1000) break
  }
  const schoolsList = allSchoolsForFilters

  // Считаем количество ПРОГРАММ по странам (не школ) — параллельные head-count запросы
  const COUNTRY_CODES_FOR_COUNT = ['us', 'gb', 'ca', 'de', 'fr', 'it', 'es', 'nl', 'at', 'au', 'ie', 'ae', 'hu']
  const countResults = await Promise.all(
    COUNTRY_CODES_FOR_COUNT.map(c =>
      parser.from('programs')
        .select('id, school:schools!inner(country_code)', { count: 'exact', head: true })
        .eq('school.country_code', c)
        .then(r => ({ code: c, count: r.count || 0 }))
    )
  )
  const countryCounts: Record<string, number> = {}
  for (const r of countResults) countryCounts[r.code] = r.count

  const { data: programs, count } = await query
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
                <span className="ds-stat-num">{total.toLocaleString('ru')}</span>
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
            initial={{ q, country, school: schoolFilter, levels, intakeYears, sort, specialty, uniType, budget }}
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
