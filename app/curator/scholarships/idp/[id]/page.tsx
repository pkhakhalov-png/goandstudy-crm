import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createScholarshipsClient, type IdpScholarship } from '@/lib/supabase/scholarships'
import { CuratorSidebar } from '../../../CuratorSidebar'
import { AddScholarshipButton } from '../../AddScholarshipButton'
import { ScholarshipLogo } from '../../ScholarshipLogo'

export const dynamic = 'force-dynamic'

const cardStyle: React.CSSProperties = {
  background: 'var(--surf)',
  border: '1px solid var(--bor)',
  borderRadius: 14,
  padding: '16px 20px',
  boxShadow: 'var(--sh)',
}

const sectionTitle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12,
}

const COUNTRY_LABEL: Record<string, string> = {
  gb: '🇬🇧 Великобритания', ca: '🇨🇦 Канада', au: '🇦🇺 Австралия',
  us: '🇺🇸 США', nz: '🇳🇿 Новая Зеландия', ie: '🇮🇪 Ирландия',
}

type IdpRow = IdpScholarship & {
  school?: { id: number; name: string; logo_url: string | null; website: string | null } | null
}

export default async function IdpScholarshipDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ asClient?: string; clientId?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const asClient = sp.asClient === '1'
  const num = Number(id)
  if (!num) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') redirect('/login')

  const sb = createScholarshipsClient()
  const { data: row } = await sb
    .from('idp_scholarships')
    .select('*, school:schools(id, name, logo_url, website)')
    .eq('id', num)
    .maybeSingle<IdpRow>()
  if (!row) notFound()

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

  function fmtDeadline(d: string | null) {
    if (!d) return '—'
    try {
      return new Date(d).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
    } catch { return d }
  }
  function daysLeft(d: string | null): number | null {
    if (!d) return null
    const ms = new Date(d).getTime() - Date.now()
    if (!Number.isFinite(ms)) return null
    return Math.ceil(ms / (24 * 3600 * 1000))
  }

  const dl = daysLeft(row.application_deadline)
  const valueLabel = row.value_amount
    ? `${Number(row.value_amount).toLocaleString('ru')} ${row.value_currency || ''}`.trim()
    : row.value_text
  const institution = row.school?.name || row.university_name || '—'
  const countryLabel = row.country_code ? COUNTRY_LABEL[row.country_code.toLowerCase()] : null

  return (
    <div className="app">
      <CuratorSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="scholarships" />
      <div className="main">
        <div className="topbar" style={{ gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <Link href="/curator/scholarships?source=idp" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 13 }}>
              ← Стипендии
            </Link>
            <span style={{ color: 'var(--bor2)' }}>/</span>
            <span className="pt" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.name}
            </span>
          </div>
        </div>

        <div style={{ padding: '20px 28px 40px' }}>
          {/* Header */}
          <div style={{ ...cardStyle, padding: 20, marginBottom: 16, borderLeft: '3px solid #0088cc' }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <ScholarshipLogo
                logoUrl={row.school?.logo_url || null}
                fallbackUrl={null}
                title={institution}
                size={64}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{row.name}</h1>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0088cc', background: 'rgba(0,136,204,.10)', padding: '3px 8px', borderRadius: 4 }}>
                    IDP
                  </span>
                </div>
                <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6 }}>
                  {countryLabel && <span style={{ marginRight: 8 }}>{countryLabel}</span>}
                  {row.school?.id ? (
                    <Link href={`/curator/universities/${row.school.id}`} style={{ color: 'var(--purple)', textDecoration: 'none' }}>
                      {institution} →
                    </Link>
                  ) : (
                    <span>{institution}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                  {row.level && <span className="ctag" style={{ fontSize: 11 }}>{row.level}</span>}
                  {row.funding_type && (
                    <span className="ctag" style={{ fontSize: 11 }}>
                      {row.funding_type === 'Cash' ? '💰 Cash' : '🎓 Fee waiver'}
                    </span>
                  )}
                  {dl != null && dl >= 0 && dl <= 90 && (
                    <span className="ctag" style={{ fontSize: 11, background: 'rgba(220,53,69,.10)', color: 'var(--red)', borderColor: 'rgba(220,53,69,.25)' }}>
                      Closes in {dl} days
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {!asClient && <AddScholarshipButton scholarshipId={row.id} myClients={myClients ?? []} kind="idp" />}
              <a href={row.idp_url} target="_blank" rel="noopener" className="btn-s" style={{ fontSize: 12, textDecoration: 'none' }}>
                View on IDP →
              </a>
              {row.school?.website && (
                <a href={row.school.website} target="_blank" rel="noopener" className="btn-s" style={{ fontSize: 12, textDecoration: 'none' }}>
                  Сайт вуза →
                </a>
              )}
            </div>
          </div>

          {/* Two-column */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }} className="sch-grid">
            <style>{`
              @media (max-width: 900px) {
                .sch-grid { grid-template-columns: 1fr !important; }
              }
            `}</style>

            <div style={{ display: 'grid', gap: 12 }}>
              {row.description ? (
                <div style={cardStyle}>
                  <div style={sectionTitle}>Описание</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{row.description}</div>
                </div>
              ) : (
                <div style={cardStyle}>
                  <div style={sectionTitle}>Описание</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                    IDP не отдаёт описание на листинге — детальный текст на странице стипендии.{' '}
                    <a href={row.idp_url} target="_blank" rel="noopener" style={{ color: 'var(--purple)' }}>
                      Открыть на IDP →
                    </a>
                  </div>
                </div>
              )}
              {row.eligibility && (
                <div style={cardStyle}>
                  <div style={sectionTitle}>Условия</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{row.eligibility}</div>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
              <div style={cardStyle}>
                <div style={sectionTitle}>Сумма</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{valueLabel || '—'}</div>
                {row.funding_type && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    {row.funding_type === 'Cash' ? 'Денежная' : 'Скидка на обучение'}
                  </div>
                )}
              </div>
              <div style={cardStyle}>
                <div style={sectionTitle}>Дедлайн</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtDeadline(row.application_deadline)}</div>
                {dl != null && dl >= 0 && (
                  <div style={{ fontSize: 11, color: dl <= 30 ? 'var(--red)' : 'var(--muted)', marginTop: 4 }}>
                    Осталось {dl} дн.
                  </div>
                )}
                {!row.application_deadline && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>
                    Уточняйте на сайте IDP — часто rolling admissions
                  </div>
                )}
              </div>
              {row.school?.id && (
                <div style={cardStyle}>
                  <div style={sectionTitle}>Вуз</div>
                  <Link
                    href={`/curator/universities/${row.school.id}`}
                    style={{ fontSize: 13, color: 'var(--purple)', textDecoration: 'none' }}
                  >
                    {row.school.name} →
                  </Link>
                </div>
              )}
              <div style={cardStyle}>
                <div style={sectionTitle}>Источник</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                  IDP Connect — официальный международный агрегатор студентов. Данные обновляются раз в 2-3 месяца.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
