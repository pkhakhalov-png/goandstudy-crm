import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createParserClient } from '@/lib/supabase/parser'
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

  // School logos from parser DB
  let logoBySchool: Record<number, string | null> = {}
  if (schoolIds.length > 0) {
    try {
      const parser = createParserClient()
      const { data: schools } = await parser.from('schools').select('id, logo_url').in('id', Array.from(new Set(schoolIds)))
      for (const s of schools || []) logoBySchool[s.id as number] = (s as any).logo_url
    } catch {}
  }

  // Fetch catalog data only when Shortlist tab is active (cheaper nav)
  let catalog: {
    programs: any[]
    schools: any[]
    countryCodes: string[]
    total: number
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
    const page = Math.max(1, parseInt(sp.page || '1', 10) || 1)
    const offset = (page - 1) * CATALOG_PAGE_SIZE

    const parser = createParserClient()
    let query = parser
      .from('programs')
      .select(
        `id, name, tuition, application_fee, raw_data, school_id,
         school:schools!inner(id, name, logo_url, country_code, city, institution_type)`,
        { count: 'exact' }
      )
      .range(offset, offset + CATALOG_PAGE_SIZE - 1)

    if (sort === 'price_asc') query = query.order('tuition', { ascending: true, nullsFirst: false })
    else if (sort === 'price_desc') query = query.order('tuition', { ascending: false, nullsFirst: false })
    else if (sort === 'recent') query = query.order('updated_at', { ascending: false })
    else query = query.order('name')

    if (country) query = query.eq('school.country_code', country)
    if (schoolFilter) query = query.eq('school_id', Number(schoolFilter))
    if (q) query = query.ilike('name', `%${q}%`)
    if (levels.length > 0) query = query.in('raw_data->attributes->>level', levels)
    if (intakeYears.length > 0) {
      const orExpr = intakeYears.map(y => `raw_data->attributes->earliest_intake->>start_date.like.${y}%`).join(',')
      query = query.or(orExpr)
    }

    const [{ data: progs, count }, { data: schoolsList }, { data: countryRows }] = await Promise.all([
      query,
      parser.from('schools').select('id, name, country_code').order('name').limit(1000),
      parser.from('schools').select('country_code').limit(2000),
    ])

    const countryCodes = Array.from(
      new Set((countryRows ?? []).map(r => (r.country_code || '').toLowerCase()).filter(Boolean))
    ).sort()

    catalog = {
      programs: progs ?? [],
      schools: schoolsList ?? [],
      countryCodes,
      total: count ?? 0,
      page,
      pageSize: CATALOG_PAGE_SIZE,
      filters: { q, country, school: schoolFilter, levels: levels.join(','), intakes: intakeYears.join(','), sort },
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
      />
    </div>
  )
}
