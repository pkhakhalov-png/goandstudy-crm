import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createParserClient } from '@/lib/supabase/parser'
import { matchScholarshipsForSchools } from '@/lib/scholarship-match'
import { searchPrograms } from '@/lib/catalog-search'
import { redirect, notFound } from 'next/navigation'
import { CuratorSidebar } from '../../CuratorSidebar'
import { ClientWorkspace } from './ClientWorkspace'

const CATALOG_PAGE_SIZE = 12

type SortKey = 'name_asc' | 'price_asc' | 'price_desc' | 'recent'

type Search = {
  tab?: string
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

export default async function CuratorClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Search>
}) {
  const { id } = await params
  const clientId = Number(id)
  if (!clientId) notFound()

  const sp = await searchParams
  const initialTab = sp.tab || 'project'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') redirect('/login')

  const admin = await createAdminClient()

  const { data: curatorRecord } = await admin.from('curators').select('id').eq('user_id', user.id).maybeSingle()
  const curatorId = curatorRecord?.id

  const isPrivileged = profile?.role === 'admin' || profile?.role === 'rop'

  const { data: client } = isPrivileged
    ? await admin.from('clients').select('*').eq('id', clientId).maybeSingle()
    : await admin.from('clients').select('*').eq('id', clientId).eq('curator_id', curatorId || '').maybeSingle()

  if (!client) notFound()

  const [
    { data: stages },
    { data: clientStages },
    { data: universities },
    { data: documents },
    { data: activities },
    { data: checklist },
    { data: checklistProgress },
    { data: messages },
    { data: files },
  ] = await Promise.all([
    admin.from('curator_stages').select('*').order('position'),
    admin.from('client_stages').select('*').eq('client_id', clientId),
    admin.from('client_universities').select('*').eq('client_id', clientId),
    admin.from('client_documents').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    admin.from('client_activities').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    admin.from('curator_stage_checklist').select('*').order('position'),
    admin.from('client_checklist_progress').select('*').eq('client_id', clientId),
    admin.from('client_tg_messages').select('*').eq('client_id', clientId).order('created_at', { ascending: true }),
    admin.from('client_tg_files').select('*').eq('client_id', clientId),
  ])

  // Essays (resume + motivation) — may not exist if migration not applied
  const { data: essays } = await admin
    .from('client_essays').select('*').eq('client_id', clientId)
    .then(r => r, () => ({ data: [] as any[] }))

  // Scholarships in client's shortlist — may not exist if migration not applied
  const { data: scholarships } = await admin
    .from('client_scholarships').select('*').eq('client_id', clientId).order('deadline', { ascending: true, nullsFirst: false })
    .then(r => r, () => ({ data: [] as any[] }))

  // Applications — may not exist if migration not applied
  const { data: applications } = await admin
    .from('client_applications').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
    .then(r => r, () => ({ data: [] as any[] }))

  // Extract school + program ids from universities.notes
  const programIds: number[] = []
  const schoolIds: number[] = []
  for (const u of universities || []) {
    try {
      const meta = JSON.parse(u.notes || '{}')
      if (typeof meta.program_id === 'number') programIds.push(meta.program_id)
      if (typeof meta.school_id === 'number') schoolIds.push(meta.school_id)
    } catch {}
  }

  // AI enrichment cache
  let enrichmentByProgram: Record<number, any> = {}
  if (programIds.length > 0) {
    const { data: enrichments } = await admin
      .from('program_curator_data')
      .select('*')
      .in('program_id', programIds)
      .then(r => r, () => ({ data: [] as any[] }))
    for (const e of enrichments || []) {
      enrichmentByProgram[e.program_id] = e
    }
  }

  // School logos + name + country (для матчера стипендий) из parser DB
  let logoBySchool: Record<number, string | null> = {}
  let schoolsForMatch: { id: number; name: string; country_code: string | null }[] = []
  if (schoolIds.length > 0) {
    try {
      const parser = createParserClient()
      const { data: schools } = await parser
        .from('schools')
        .select('id, name, country_code, logo_url')
        .in('id', Array.from(new Set(schoolIds)))
      for (const s of schools || []) {
        logoBySchool[s.id as number] = (s as any).logo_url
        schoolsForMatch.push({ id: s.id as number, name: (s as any).name, country_code: (s as any).country_code })
      }
    } catch {}
  }

  // Стипендии-suggestions: матч по вузам клиента (3 источника)
  let suggestedScholarships: any[] = []
  try {
    suggestedScholarships = schoolsForMatch.length > 0
      ? await matchScholarshipsForSchools(schoolsForMatch)
      : []
  } catch (e) {
    console.error('[clients/page] matchScholarshipsForSchools failed:', e)
  }

  // Fetch catalog data only when Shortlist tab is active (cheaper nav)
  let catalog: {
    programs: any[]
    schools: any[]
    countryCodes: string[]
    countryCounts: Record<string, number>
    specialtyOptions: string[]
    total: number
    totalCapped?: boolean
    page: number
    pageSize: number
    filters: Search
  } | null = null

  if (initialTab === 'shortlist') {
    const q = sp.q?.trim() || ''
    const country = sp.country?.trim().toLowerCase() || ''
    const schoolFilter = sp.school?.trim() || ''
    const levels = (sp.levels || '').split(',').map(s => s.trim()).filter(Boolean)
    const intakeYears = (sp.intakes || '').split(',').map(s => s.trim()).filter(Boolean)
    const sort = (sp.sort as SortKey) || 'name_asc'
    const specialty = sp.specialty?.trim() || ''
    const uniType = sp.uniType?.trim() || ''
    const budget = sp.budget?.trim() || ''
    const page = Math.max(1, parseInt(sp.page || '1', 10) || 1)
    const offset = (page - 1) * CATALOG_PAGE_SIZE

    const parser = createParserClient()
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
      limit: CATALOG_PAGE_SIZE,
      offset,
    })

    // Подгружаем все школы постранично для дропдауна и счётчиков стран
    const allSchools: { id: number; name: string; country_code: string | null }[] = []
    for (let off = 0; off < 10000; off += 1000) {
      const { data } = await parser.from('schools').select('id, name, country_code').order('name').range(off, off + 999)
      if (!data || data.length === 0) break
      allSchools.push(...(data as any[]))
      if (data.length < 1000) break
    }

    // Считаем количество ПРОГРАММ по странам — без inner-join (на проде он давал ложные count=0).
    // Группируем school_id по country_code один раз, потом считаем programs с .in() по списку id.
    const COUNTRY_CODES_FOR_COUNT = ['us', 'gb', 'ca', 'de', 'fr', 'it', 'es', 'nl', 'at', 'au', 'ie', 'ae', 'hu']
    const idsByCountry = new Map<string, number[]>()
    for (const s of allSchools) {
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

    const progs = searchResult.rows
    const count = searchResult.total

    const countryCodes = COUNTRY_CODES_FOR_COUNT.filter(c => (countryCounts[c] || 0) > 0)

    const SPECIALTY_OPTIONS = [
      'Бизнес и управление', 'IT и технологии', 'Экономика и финансы', 'Инженерия',
      'Медицина и здоровье', 'Право', 'Дизайн и искусство', 'Гуманитарные науки',
      'Естественные науки', 'Социальные науки', 'Образование', 'Медиа и коммуникации',
      'Туризм и гостиничный', 'Архитектура', 'Языковые курсы', 'Другое',
    ]

    catalog = {
      programs: progs ?? [],
      schools: allSchools,
      countryCodes,
      countryCounts,
      specialtyOptions: SPECIALTY_OPTIONS,
      total: count ?? 0,
      totalCapped: searchResult.totalCapped,
      page,
      pageSize: CATALOG_PAGE_SIZE,
      filters: { q, country, school: schoolFilter, levels: levels.join(','), intakes: intakeYears.join(','), sort, specialty, uniType, budget },
    }
  }

  const initials = (profile?.name || user.email || 'КР')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="app">
      <CuratorSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="clients" />
      <ClientWorkspace
        client={client}
        stages={stages ?? []}
        clientStages={clientStages ?? []}
        universities={universities ?? []}
        documents={documents ?? []}
        activities={activities ?? []}
        checklist={checklist ?? []}
        checklistProgress={checklistProgress ?? []}
        messages={messages ?? []}
        files={files ?? []}
        curatorId={curatorId || client.curator_id || ''}
        initialTab={initialTab}
        catalog={catalog}
        enrichmentByProgram={enrichmentByProgram}
        logoBySchool={logoBySchool}
        essays={essays || []}
        scholarships={scholarships || []}
        suggestedScholarships={suggestedScholarships}
        applications={applications || []}
      />
    </div>
  )
}
