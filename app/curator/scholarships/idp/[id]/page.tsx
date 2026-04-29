import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createScholarshipsClient, type IdpScholarship } from '@/lib/supabase/scholarships'
import { CuratorSidebar } from '../../../CuratorSidebar'
import { AddScholarshipButton } from '../../AddScholarshipButton'
import { ScholarshipLogo } from '../../ScholarshipLogo'
import { FillIdpScholarshipButton } from './FillIdpScholarshipButton'

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

type CuratorExtras = {
  gpa_requirement?: string
  language_requirement?: string
  renewable?: boolean
  application_process?: string
  official_url?: string
  filled_at?: string
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
  const extras: CuratorExtras = ((row.raw_data as any)?.curator_extras as CuratorExtras) || {}
  const isAsClient = asClient
  const hasFilledData = !!(row.description || row.eligibility || extras.gpa_requirement || extras.application_process)

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
              {!isAsClient && <AddScholarshipButton scholarshipId={row.id} myClients={myClients ?? []} kind="idp" />}
              {!isAsClient && <FillIdpScholarshipButton id={row.id} hasData={hasFilledData} />}
              <a href={row.idp_url} target="_blank" rel="noopener" className="btn-s" style={{ fontSize: 12, textDecoration: 'none' }}>
                View on IDP →
              </a>
              {extras.official_url && (
                <a href={extras.official_url} target="_blank" rel="noopener" className="btn-s" style={{ fontSize: 12, textDecoration: 'none' }}>
                  Страница вуза →
                </a>
              )}
              {row.school?.website && !extras.official_url && (
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
                  <MarkdownDescription text={row.description} />
                </div>
              ) : (
                <div style={cardStyle}>
                  <div style={sectionTitle}>Описание</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                    IDP не отдаёт описание на листинге. Нажми «Дополнить через ИИ» в шапке — агент сходит на сайт вуза и подтянет полезную сводку (для кого, что покрывает, как подать, требования).
                  </div>
                </div>
              )}
              {row.eligibility && (
                <div style={cardStyle}>
                  <div style={sectionTitle}>Условия отбора</div>
                  <MarkdownDescription text={row.eligibility} />
                </div>
              )}
              {extras.application_process && (
                <div style={cardStyle}>
                  <div style={sectionTitle}>Как подать</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>{extras.application_process}</div>
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
              {(extras.gpa_requirement || extras.language_requirement || extras.renewable !== undefined) && (
                <div style={cardStyle}>
                  <div style={sectionTitle}>Требования</div>
                  <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
                    {extras.gpa_requirement && (
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>GPA</div>
                        <div style={{ fontWeight: 600, marginTop: 2 }}>{extras.gpa_requirement}</div>
                      </div>
                    )}
                    {extras.language_requirement && (
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Язык</div>
                        <div style={{ fontWeight: 600, marginTop: 2 }}>{extras.language_requirement}</div>
                      </div>
                    )}
                    {extras.renewable !== undefined && (
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Продление</div>
                        <div style={{ fontWeight: 600, marginTop: 2, color: extras.renewable ? 'var(--green)' : 'var(--text)' }}>
                          {extras.renewable ? '✓ Продлевается' : 'Только на 1 год'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
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
                  {extras.filled_at && (
                    <div style={{ marginTop: 6, fontStyle: 'italic' }}>
                      Дополнено ИИ: {new Date(extras.filled_at).toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MarkdownDescription({ text }: { text: string }) {
  // Парсим: ## Заголовок — h3, - bullet — li, остальное — параграф
  const lines = text.split(/\r?\n/)
  const blocks: { type: 'heading' | 'paragraph' | 'list'; content: string | string[] }[] = []
  let buf: string[] = []
  let bullets: string[] = []
  const flushPara = () => { if (buf.length) { blocks.push({ type: 'paragraph', content: buf.join(' ').trim() }); buf = [] } }
  const flushList = () => { if (bullets.length) { blocks.push({ type: 'list', content: [...bullets] }); bullets = [] } }
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { flushPara(); flushList(); continue }
    const h = /^#{1,3}\s+(.+)$/.exec(line)
    if (h) { flushPara(); flushList(); blocks.push({ type: 'heading', content: h[1].trim() }); continue }
    const b = /^[-•]\s+(.+)$/.exec(line)
    if (b) { flushPara(); bullets.push(b[1].trim()); continue }
    flushList(); buf.push(line)
  }
  flushPara(); flushList()

  return (
    <div style={{ display: 'grid', gap: 10, color: 'var(--text)' }}>
      {blocks.map((b, i) => {
        if (b.type === 'heading') return (
          <div key={i} style={{ fontSize: 13, fontWeight: 700, color: 'var(--purple)', marginTop: i === 0 ? 0 : 6 }}>
            {b.content as string}
          </div>
        )
        if (b.type === 'list') return (
          <ul key={i} style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>
            {(b.content as string[]).map((it, j) => <li key={j} style={{ marginBottom: 4 }}>{it}</li>)}
          </ul>
        )
        return (
          <div key={i} style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {b.content as string}
          </div>
        )
      })}
    </div>
  )
}

