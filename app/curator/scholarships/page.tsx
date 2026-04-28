import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createScholarshipsClient, type Scholarship, type GovernmentScholarship } from '@/lib/supabase/scholarships'
import { CuratorSidebar } from '../CuratorSidebar'
import { AddScholarshipButton } from './AddScholarshipButton'
import { ScholarshipLogo } from './ScholarshipLogo'
import { VerifyScholarshipButton } from './VerifyScholarshipButton'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30

const COUNTRY_FLAGS: Record<string, string> = {
  gb: '🇬🇧', us: '🇺🇸', de: '🇩🇪', hu: '🇭🇺', kr: '🇰🇷',
  nl: '🇳🇱', se: '🇸🇪', it: '🇮🇹', fr: '🇫🇷', es: '🇪🇸',
  ca: '🇨🇦', au: '🇦🇺', ie: '🇮🇪', ch: '🇨🇭', dk: '🇩🇰',
  no: '🇳🇴', fi: '🇫🇮', pl: '🇵🇱', cz: '🇨🇿', jp: '🇯🇵',
  cn: '🇨🇳',
}

export default async function ScholarshipsCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; level?: string; type?: string; deadline?: string; page?: string; source?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') redirect('/login')

  const sp = await searchParams
  const q = (sp.q || '').trim()
  const level = sp.level || ''
  const type = sp.type || ''
  const deadlineFilter = sp.deadline || '' // 'soon' = next 90 days
  const source = sp.source || '' // '' | 'private' | 'government'
  const page = Math.max(1, Number(sp.page) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const sb = createScholarshipsClient()
  const today = new Date().toISOString().slice(0, 10)

  // ─── Private (TopUni) ───
  let scholarships: Scholarship[] = []
  let count = 0
  let error: { message: string } | null = null

  if (source !== 'government') {
    let query = sb
      .from('scholarships_topuni')
      .select('*', { count: 'exact' })
      .eq('archived', false)
      .or(`deadline.is.null,deadline.gte.${today}`)
    if (q) query = query.or(`title.ilike.%${q}%,institution_title.ilike.%${q}%`)
    if (level) query = query.contains('study_levels', [level])
    if (type) query = query.eq('amount_type', type)
    if (deadlineFilter === 'soon') {
      const in90 = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString().slice(0, 10)
      query = query.not('deadline', 'is', null).gte('deadline', today).lte('deadline', in90)
    }
    query = query.order('deadline', { ascending: true, nullsFirst: false }).range(offset, offset + PAGE_SIZE - 1)
    const res = await query
    scholarships = (res.data as Scholarship[]) || []
    count = res.count || 0
    error = res.error ? { message: res.error.message } : null
  }

  // ─── Government ───
  let govScholarships: GovernmentScholarship[] = []
  let govError: { message: string } | null = null
  if (source !== 'private') {
    let gq = sb
      .from('government_scholarships')
      .select('*')
      .eq('is_active', true)
      .or(`application_deadline.is.null,application_deadline.gte.${today}`)
    if (q) gq = gq.or(`name.ilike.%${q}%,short_name.ilike.%${q}%,country_name.ilike.%${q}%`)
    if (level) {
      // gov levels lowercase: bachelors / masters / phd / postdoc
      gq = gq.contains('levels', [level.toLowerCase().replace(/s$/, 's')])
    }
    if (deadlineFilter === 'soon') {
      const in90 = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString().slice(0, 10)
      gq = gq.not('application_deadline', 'is', null).gte('application_deadline', today).lte('application_deadline', in90)
    }
    gq = gq.order('application_deadline', { ascending: true, nullsFirst: false })
    const res = await gq
    govScholarships = (res.data as GovernmentScholarship[]) || []
    govError = res.error ? { message: res.error.message } : null
  }

  // Список клиентов куратора для дропдауна
  const admin = await createAdminClient()
  const { data: curator } = await admin.from('curators').select('id').eq('user_id', user.id).maybeSingle()
  const { data: myClients } = curator?.id
    ? await admin
        .from('clients')
        .select('id, name')
        .eq('curator_id', curator.id)
        .eq('status', 'active')
        .order('name')
    : { data: [] as { id: number; name: string }[] }

  const initials = (profile?.name || user.email || 'КР')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE))

  return (
    <div className="app">
      <CuratorSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="scholarships" />
      <div className="main">
        <div className="topbar">
          <div className="pt">Стипендии</div>
          <div className="tbr">
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {source === 'government' ? `${govScholarships.length} гос.` : source === 'private' ? `${count} частных` : `${count} частных · ${govScholarships.length} гос.`}
            </span>
          </div>
        </div>

        <div style={{ padding: '20px 28px 40px' }}>
          {/* Source tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <SourceTab href={buildUrl({ q, level, type, deadline: deadlineFilter, source: '' })} label="Все" active={source === ''} />
            <SourceTab href={buildUrl({ q, level, type, deadline: deadlineFilter, source: 'private' })} label="Частные · QS" active={source === 'private'} />
            <SourceTab href={buildUrl({ q, level, type, deadline: deadlineFilter, source: 'government' })} label="Государственные" active={source === 'government'} />
          </div>

          {/* Filters */}
          <form
            method="get"
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18, alignItems: 'center' }}
          >
            {source && <input type="hidden" name="source" value={source} />}
            <input
              name="q"
              defaultValue={q}
              placeholder="Найти по названию или вузу…"
              style={inputStyle}
            />
            <select name="level" defaultValue={level} style={selectStyle}>
              <option value="">Все уровни</option>
              <option value="Bachelors">Bachelors</option>
              <option value="Master">Master</option>
              <option value="MBA">MBA</option>
              <option value="PhD">PhD</option>
              <option value="All">All</option>
            </select>
            {source !== 'government' && (
              <select name="type" defaultValue={type} style={selectStyle}>
                <option value="">Все типы суммы</option>
                <option value="Monetary">Денежная</option>
                <option value="Percentage">Процент скидки</option>
              </select>
            )}
            <select name="deadline" defaultValue={deadlineFilter} style={selectStyle}>
              <option value="">Любой дедлайн</option>
              <option value="soon">Ближайшие 90 дней</option>
            </select>
            <button type="submit" className="btn-p" style={{ fontSize: 12 }}>Применить</button>
            {(q || level || type || deadlineFilter) && (
              <Link href={buildUrl({ source })} className="btn-s" style={{ fontSize: 12, textDecoration: 'none' }}>
                Сбросить
              </Link>
            )}
          </form>

          {(error || govError) && (
            <div style={{ ...cardStyle, padding: 16, color: 'var(--red)', marginBottom: 12 }}>
              Ошибка загрузки: {(error || govError)?.message}. Проверь env.
            </div>
          )}

          {/* Government scholarships block */}
          {source !== 'private' && govScholarships.length > 0 && (
            <>
              {source === '' && (
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', margin: '12px 0 8px' }}>
                  Государственные · {govScholarships.length}
                </div>
              )}
              <div style={{ display: 'grid', gap: 12, marginBottom: source === '' ? 24 : 0 }}>
                {govScholarships.map(g => (
                  <GovScholarshipRow key={g.id} g={g} myClients={myClients ?? []} />
                ))}
              </div>
            </>
          )}

          {/* Private scholarships block */}
          {source !== 'government' && (
            <>
              {source === '' && scholarships.length > 0 && (
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', margin: '12px 0 8px' }}>
                  Частные (QS) · {count}
                </div>
              )}
              {!error && scholarships.length === 0 && source !== '' && (
                <div style={{ ...cardStyle, padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  По текущим фильтрам ничего не найдено.
                </div>
              )}
              <div style={{ display: 'grid', gap: 12 }}>
                {scholarships.map((s: Scholarship) => (
                  <ScholarshipRow key={s.scholarship_id} s={s} myClients={myClients ?? []} />
                ))}
              </div>

              {totalPages > 1 && (
                <div style={{ marginTop: 24, display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                  {page > 1 && (
                    <Link href={buildUrl({ q, level, type, deadline: deadlineFilter, source, page: page - 1 })} className="btn-s" style={{ fontSize: 12, textDecoration: 'none' }}>
                      ← Назад
                    </Link>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Стр. {page} из {totalPages}
                  </span>
                  {page < totalPages && (
                    <Link href={buildUrl({ q, level, type, deadline: deadlineFilter, source, page: page + 1 })} className="btn-s" style={{ fontSize: 12, textDecoration: 'none' }}>
                      Далее →
                    </Link>
                  )}
                </div>
              )}
            </>
          )}

          {source === 'government' && govScholarships.length === 0 && !govError && (
            <div style={{ ...cardStyle, padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Государственных стипендий по фильтрам не найдено.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function buildUrl(p: { q?: string; level?: string; type?: string; deadline?: string; source?: string; page?: number }) {
  const params = new URLSearchParams()
  if (p.q) params.set('q', p.q)
  if (p.level) params.set('level', p.level)
  if (p.type) params.set('type', p.type)
  if (p.deadline) params.set('deadline', p.deadline)
  if (p.source) params.set('source', p.source)
  if (p.page && p.page > 1) params.set('page', String(p.page))
  const qs = params.toString()
  return qs ? `/curator/scholarships?${qs}` : '/curator/scholarships'
}

function SourceTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      style={{
        padding: '8px 14px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        background: active ? 'var(--purple)' : 'var(--surf)',
        color: active ? '#fff' : 'var(--text)',
        border: `1px solid ${active ? 'var(--purple)' : 'var(--bor2)'}`,
        textDecoration: 'none',
      }}
    >
      {label}
    </Link>
  )
}

const cardStyle: React.CSSProperties = {
  background: 'var(--surf)',
  border: '1px solid var(--bor)',
  borderRadius: 14,
  boxShadow: 'var(--sh)',
}

const inputStyle: React.CSSProperties = {
  fontSize: 13, padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--bor2)', background: 'var(--surf)', color: 'var(--text)',
  width: 280,
}

const selectStyle: React.CSSProperties = {
  fontSize: 13, padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--bor2)', background: 'var(--surf)', color: 'var(--text)',
}

function ScholarshipRow({ s, myClients }: { s: Scholarship; myClients: { id: number; name: string }[] }) {
  const desc = (s.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const shortDesc = desc.length > 220 ? desc.slice(0, 220) + '…' : desc

  function fmtDeadline(d: string | null) {
    if (!d) return null
    try {
      return new Date(d).toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch { return d }
  }

  return (
    <div style={{ ...cardStyle, padding: 16, display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: 14, alignItems: 'flex-start' }}>
      <ScholarshipLogo logoUrl={s.institution_logo_url_local || s.institution_logo_url} fallbackUrl={s.institution_logo_url_local ? s.institution_logo_url : null} title={s.institution_title || s.title} size={52} />


      <div style={{ minWidth: 0 }}>
        <Link
          href={`/curator/scholarships/${s.scholarship_id}`}
          style={{ textDecoration: 'none', color: 'var(--text)' }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{s.title}</div>
        </Link>
        {s.institution_title && (
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{s.institution_title}</div>
        )}
        {shortDesc && (
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>{shortDesc}</div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {(s.study_levels || []).map(lv => (
            <span key={lv} className="ctag" style={{ fontSize: 11 }}>{lv}</span>
          ))}
          {s.amount_text && (
            <span className="ctag" style={{ fontSize: 11, background: 'rgba(22,163,97,.08)', color: 'var(--green)', borderColor: 'rgba(22,163,97,.2)' }}>
              {s.amount_text}
            </span>
          )}
          {s.deadline && (
            <span className="ctag" style={{ fontSize: 11, background: 'rgba(0,136,204,.08)', color: '#0088cc', borderColor: 'rgba(0,136,204,.2)' }}>
              до {fmtDeadline(s.deadline)}
            </span>
          )}
          {s.is_exclusive && (
            <span className="ctag" style={{ fontSize: 11, background: 'rgba(201,125,0,.12)', color: 'var(--gold)', borderColor: 'rgba(201,125,0,.2)' }}>
              QS exclusive
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        <AddScholarshipButton scholarshipId={s.scholarship_id} myClients={myClients} />
        <VerifyScholarshipButton id={s.scholarship_id} kind="private" />
        <Link
          href={`/curator/scholarships/${s.scholarship_id}`}
          style={{ fontSize: 11, color: 'var(--purple)', textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          Подробнее →
        </Link>
      </div>
    </div>
  )
}

function GovScholarshipRow({ g, myClients }: { g: GovernmentScholarship; myClients: { id: number; name: string }[] }) {
  function fmtDeadline(d: string | null) {
    if (!d) return null
    try {
      return new Date(d).toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch { return d }
  }

  const flag = g.country_code ? COUNTRY_FLAGS[g.country_code.toLowerCase()] : null
  const stipend = g.monthly_stipend
    ? `${Number(g.monthly_stipend).toLocaleString('ru')} ${g.monthly_stipend_currency || ''}/мес`
    : null
  const desc = (g.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const shortDesc = desc.length > 220 ? desc.slice(0, 220) + '…' : desc

  return (
    <div style={{ ...cardStyle, padding: 16, display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: 14, alignItems: 'flex-start', borderLeft: '3px solid var(--purple)' }}>
      <div style={{
        width: 52, height: 52, borderRadius: 12,
        background: 'rgba(177,94,204,.08)',
        display: 'grid', placeItems: 'center', fontSize: 28,
      }}>
        {flag || '🏛️'}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{g.name}</div>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--purple)', background: 'rgba(177,94,204,.10)', padding: '2px 6px', borderRadius: 4 }}>
            Государственная
          </span>
        </div>
        {g.country_name && (
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {g.country_name}{g.provider ? ` · ${g.provider}` : ''}
          </div>
        )}
        {shortDesc && (
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>{shortDesc}</div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {(g.levels || []).map(lv => (
            <span key={lv} className="ctag" style={{ fontSize: 11 }}>{lv}</span>
          ))}
          {stipend && (
            <span className="ctag" style={{ fontSize: 11, background: 'rgba(22,163,97,.08)', color: 'var(--green)', borderColor: 'rgba(22,163,97,.2)' }}>
              💰 {stipend}
            </span>
          )}
          {g.tuition_covered && (
            <span className="ctag" style={{ fontSize: 11 }}>🎓 Tuition</span>
          )}
          {g.travel_covered && (
            <span className="ctag" style={{ fontSize: 11 }}>✈️ Travel</span>
          )}
          {g.application_deadline ? (
            <span className="ctag" style={{ fontSize: 11, background: 'rgba(0,136,204,.08)', color: '#0088cc', borderColor: 'rgba(0,136,204,.2)' }}>
              до {fmtDeadline(g.application_deadline)}
            </span>
          ) : (
            <span className="ctag" style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--muted)' }}>
              дедлайн уточняется
            </span>
          )}
          {g.cis_eligible && (
            <span className="ctag" style={{ fontSize: 11, background: 'rgba(201,125,0,.12)', color: 'var(--gold)', borderColor: 'rgba(201,125,0,.2)' }}>
              ✓ для СНГ
            </span>
          )}
        </div>
        {g.last_verified_at && (
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8, fontStyle: 'italic' }}>
            Проверено {new Date(g.last_verified_at).toLocaleDateString('ru')}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        <AddScholarshipButton scholarshipId={g.id} myClients={myClients} kind="government" />
        <VerifyScholarshipButton id={g.id} kind="government" />
        {g.application_url && (
          <a
            href={g.application_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: 'var(--purple)', textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            Apply ↗
          </a>
        )}
      </div>
    </div>
  )
}
