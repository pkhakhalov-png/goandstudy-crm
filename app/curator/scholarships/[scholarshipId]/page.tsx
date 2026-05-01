import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createScholarshipsClient, type Scholarship } from '@/lib/supabase/scholarships'
import { CuratorSidebar } from '../../CuratorSidebar'
import { AddScholarshipButton } from '../AddScholarshipButton'
import { ScholarshipLogo } from '../ScholarshipLogo'
import { BackButton } from '../../universities/[schoolId]/BackButton'

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

export default async function ScholarshipDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ scholarshipId: string }>
  searchParams: Promise<{ asClient?: string; clientId?: string }>
}) {
  const { scholarshipId } = await params
  const sp = await searchParams
  const asClient = sp.asClient === '1'
  const id = Number(scholarshipId)
  if (!id) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') redirect('/login')

  const sb = createScholarshipsClient()
  const { data: scholarship } = await sb
    .from('scholarships_topuni')
    .select('*')
    .eq('scholarship_id', id)
    .maybeSingle<Scholarship>()
  if (!scholarship) notFound()

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

  const description = (scholarship.description || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()

  const applyHref = scholarship.application_type === 'External' && scholarship.application_url
    ? scholarship.application_url
    : scholarship.apply_link_qs

  return (
    <div className="app">
      <CuratorSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="scholarships" />
      <div className="main">
        <div className="topbar" style={{ gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <BackButton
              fallbackHref={asClient ? `/curator/scholarships?asClient=1${sp.clientId ? `&clientId=${sp.clientId}` : ''}` : '/curator/scholarships'}
              label="← Стипендии"
            />
            <span style={{ color: 'var(--bor2)' }}>/</span>
            <span className="pt" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {scholarship.title}
            </span>
          </div>
        </div>

        <div style={{ padding: '20px 28px 40px' }}>
          {/* Header */}
          <div style={{ ...cardStyle, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <ScholarshipLogo
                logoUrl={scholarship.institution_logo_url_local || scholarship.institution_logo_url}
                fallbackUrl={scholarship.institution_logo_url_local ? scholarship.institution_logo_url : null}
                title={scholarship.institution_title || scholarship.title}
                size={64}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{scholarship.title}</h1>
                {scholarship.institution_title && (
                  <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6 }}>{scholarship.institution_title}</div>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                  {(scholarship.study_levels || []).map(lv => (
                    <span key={lv} className="ctag" style={{ fontSize: 11 }}>{lv}</span>
                  ))}
                  {scholarship.audience && (
                    <span className="ctag" style={{ fontSize: 11 }}>{scholarship.audience}</span>
                  )}
                  {scholarship.is_exclusive && (
                    <span className="ctag" style={{ fontSize: 11, background: 'rgba(201,125,0,.12)', color: 'var(--gold)', borderColor: 'rgba(201,125,0,.2)' }}>
                      QS exclusive
                    </span>
                  )}
                  {scholarship.status === 'Open' && (
                    <span className="ctag" style={{ fontSize: 11, background: 'rgba(22,163,97,.12)', color: 'var(--green)', borderColor: 'rgba(22,163,97,.2)' }}>
                      Open
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {!asClient && <AddScholarshipButton scholarshipId={scholarship.scholarship_id} myClients={myClients ?? []} />}
              {applyHref && (
                <a href={applyHref} target="_blank" rel="noopener" className="btn-s" style={{ fontSize: 12, textDecoration: 'none' }}>
                  Подать заявку →
                </a>
              )}
              {scholarship.detail_url && (
                <a href={scholarship.detail_url} target="_blank" rel="noopener" className="btn-s" style={{ fontSize: 12, textDecoration: 'none' }}>
                  Страница на TopUniversities →
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
              {description && (
                <div style={cardStyle}>
                  <div style={sectionTitle}>Описание</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{description}</div>
                </div>
              )}
              {scholarship.entry_requirements && (
                <div style={cardStyle}>
                  <div style={sectionTitle}>Условия поступления</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{scholarship.entry_requirements}</div>
                </div>
              )}
              {scholarship.requirements && (
                <div style={cardStyle}>
                  <div style={sectionTitle}>Требования</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{scholarship.requirements}</div>
                </div>
              )}
              {scholarship.application_type === 'Other' && scholarship.application_text && (
                <div style={cardStyle}>
                  <div style={sectionTitle}>Как подать</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{scholarship.application_text}</div>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
              <div style={cardStyle}>
                <div style={sectionTitle}>Сумма</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{scholarship.amount_text || '—'}</div>
                {scholarship.amount_type && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    {scholarship.amount_type === 'Monetary' ? 'Денежная' : 'Процент скидки'}
                    {scholarship.amount_currency ? ` · ${scholarship.amount_currency}` : ''}
                  </div>
                )}
              </div>
              <div style={cardStyle}>
                <div style={sectionTitle}>Дедлайн</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtDeadline(scholarship.deadline)}</div>
                {scholarship.number_of_recipients != null && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    Получателей: {scholarship.number_of_recipients}
                  </div>
                )}
              </div>
              {scholarship.other_criteria && (
                <div style={cardStyle}>
                  <div style={sectionTitle}>Другие критерии</div>
                  <div style={{ fontSize: 12, color: 'var(--text)' }}>{scholarship.other_criteria}</div>
                </div>
              )}
              {scholarship.institution_url && (
                <div style={cardStyle}>
                  <div style={sectionTitle}>Вуз</div>
                  <a
                    href={scholarship.institution_url}
                    target="_blank"
                    rel="noopener"
                    style={{ fontSize: 13, color: 'var(--purple)', textDecoration: 'none' }}
                  >
                    {scholarship.institution_title} →
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
