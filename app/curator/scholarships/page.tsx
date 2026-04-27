import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createScholarshipsClient, type Scholarship } from '@/lib/supabase/scholarships'
import { CuratorSidebar } from '../CuratorSidebar'
import { AddScholarshipButton } from './AddScholarshipButton'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30

export default async function ScholarshipsCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; level?: string; type?: string; deadline?: string; page?: string }>
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
  const page = Math.max(1, Number(sp.page) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const sb = createScholarshipsClient()
  let query = sb.from('v_scholarships_active').select('*', { count: 'exact' })
  if (q) {
    query = query.or(`title.ilike.%${q}%,institution_title.ilike.%${q}%`)
  }
  if (level) query = query.contains('study_levels', [level])
  if (type) query = query.eq('amount_type', type)
  if (deadlineFilter === 'soon') {
    const today = new Date()
    const in90 = new Date(today.getTime() + 90 * 24 * 3600 * 1000)
    query = query
      .not('deadline', 'is', null)
      .gte('deadline', today.toISOString().slice(0, 10))
      .lte('deadline', in90.toISOString().slice(0, 10))
  }
  query = query.order('deadline', { ascending: true, nullsFirst: false }).range(offset, offset + PAGE_SIZE - 1)
  const { data: scholarships, count, error } = await query

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
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{count ?? 0} активных</span>
          </div>
        </div>

        <div style={{ padding: '20px 28px 40px' }}>
          {/* Filters */}
          <form
            method="get"
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18, alignItems: 'center' }}
          >
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
            <select name="type" defaultValue={type} style={selectStyle}>
              <option value="">Все типы суммы</option>
              <option value="Monetary">Денежная</option>
              <option value="Percentage">Процент скидки</option>
            </select>
            <select name="deadline" defaultValue={deadlineFilter} style={selectStyle}>
              <option value="">Любой дедлайн</option>
              <option value="soon">Ближайшие 90 дней</option>
            </select>
            <button type="submit" className="btn-p" style={{ fontSize: 12 }}>Применить</button>
            {(q || level || type || deadlineFilter) && (
              <Link href="/curator/scholarships" className="btn-s" style={{ fontSize: 12, textDecoration: 'none' }}>
                Сбросить
              </Link>
            )}
          </form>

          {error && (
            <div style={{ ...cardStyle, padding: 16, color: 'var(--red)' }}>
              Ошибка загрузки: {error.message}. Проверь NEXT_PUBLIC_SCHOLARSHIPS_SUPABASE_URL и _ANON_KEY в env.
            </div>
          )}

          {!error && (scholarships ?? []).length === 0 && (
            <div style={{ ...cardStyle, padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              По текущим фильтрам ничего не найдено.
            </div>
          )}

          <div style={{ display: 'grid', gap: 12 }}>
            {(scholarships ?? []).map((s: Scholarship) => (
              <ScholarshipRow key={s.scholarship_id} s={s} myClients={myClients ?? []} />
            ))}
          </div>

          {totalPages > 1 && (
            <div style={{ marginTop: 24, display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
              {page > 1 && (
                <Link href={buildUrl({ q, level, type, deadline: deadlineFilter, page: page - 1 })} className="btn-s" style={{ fontSize: 12, textDecoration: 'none' }}>
                  ← Назад
                </Link>
              )}
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                Стр. {page} из {totalPages}
              </span>
              {page < totalPages && (
                <Link href={buildUrl({ q, level, type, deadline: deadlineFilter, page: page + 1 })} className="btn-s" style={{ fontSize: 12, textDecoration: 'none' }}>
                  Далее →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function buildUrl(p: { q?: string; level?: string; type?: string; deadline?: string; page?: number }) {
  const params = new URLSearchParams()
  if (p.q) params.set('q', p.q)
  if (p.level) params.set('level', p.level)
  if (p.type) params.set('type', p.type)
  if (p.deadline) params.set('deadline', p.deadline)
  if (p.page && p.page > 1) params.set('page', String(p.page))
  const qs = params.toString()
  return qs ? `/curator/scholarships?${qs}` : '/curator/scholarships'
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
      {s.institution_logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={s.institution_logo_url}
          alt={s.institution_title || ''}
          style={{ width: 52, height: 52, objectFit: 'contain', background: '#fff', border: '1px solid var(--bor)', borderRadius: 10 }}
        />
      ) : (
        <div style={{ width: 52, height: 52, background: 'var(--purple)', color: '#fff', borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 700 }}>
          {(s.institution_title || s.title)[0]?.toUpperCase() || '?'}
        </div>
      )}

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
