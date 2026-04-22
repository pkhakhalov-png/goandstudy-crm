import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createParserClient } from '@/lib/supabase/parser'
import { CuratorSidebar } from '../../CuratorSidebar'
import { AddToShortlistButton } from '../../universities/[schoolId]/AddToShortlistButton'
import { FillProgramButton } from './FillProgramButton'

const COUNTRY_LABEL: Record<string, string> = {
  ca: 'Канада', au: 'Австралия', gb: 'Великобритания', de: 'Германия',
  us: 'США', ie: 'Ирландия',
}

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

export default async function ProgramPage({
  params,
}: {
  params: Promise<{ programId: string }>
}) {
  const { programId } = await params
  const id = Number(programId)
  if (!id) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop') redirect('/login')

  const parser = createParserClient()
  const { data: program } = await parser
    .from('programs')
    .select(`
      *,
      school:schools(id, name, logo_url, country_code, city, province, address, institution_type, avg_tuition, cost_of_living, currency_of_fees, raw_data)
    `)
    .eq('id', id)
    .maybeSingle()

  if (!program) notFound()

  const school = program.school || {}
  const attr = program.raw_data?.attributes || {}
  const schoolRaw = school.raw_data?.attributes || {}

  // Клиенты куратора + заполненные ИИ данные
  const admin = await createAdminClient()
  const { data: curatorRec } = await admin
    .from('curators').select('id').eq('user_id', user.id).maybeSingle()
  const curatorId = curatorRec?.id
  const [{ data: myClients }, { data: curatorData }] = await Promise.all([
    curatorId
      ? admin.from('clients').select('id, name, country').eq('curator_id', curatorId).eq('status', 'active').order('name')
      : Promise.resolve({ data: [] as { id: number; name: string; country?: string | null }[] }),
    admin.from('program_curator_data').select('*').eq('program_id', id).maybeSingle(),
  ])

  // Кто последним обновлял — для подписи «обновил X»
  let lastUpdatedByName: string | null = null
  if (curatorData?.last_updated_by) {
    const { data: c } = await admin
      .from('curators').select('name').eq('id', curatorData.last_updated_by).maybeSingle()
    lastUpdatedByName = c?.name || null
  }

  const initials = (profile?.name || user.email || 'КР')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  const countryLabel = COUNTRY_LABEL[(school.country_code || '').toLowerCase()]
    || (school.country_code || '').toUpperCase()

  const levelText = attr.level_text || program.program_level_text
  const tuition = program.tuition
  const currency = attr.currency_of_fees?.code || attr.currency?.code
    || schoolRaw.currency_of_fees?.code || program.currency || ''
  const appFee = program.application_fee ?? attr.application_fee
  const intake = attr.earliest_intake?.start_date || program.earliest_intake_date
  const deadline = attr.earliest_intake?.submission_deadline
  const coopLen = attr.coop_length
  const delivery = attr.delivery_method
  const language = attr.language_of_instruction || program.language
  const description = attr.description
    ? attr.description.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
    : ''
  const otherFees: string[] = Array.isArray(attr.other_fees) ? attr.other_fees : []

  function fmt(v: any) {
    if (v == null || v === '') return '—'
    const n = Number(v)
    return Number.isFinite(n) ? Math.round(n).toLocaleString('ru') : String(v)
  }
  function fmtDate(s?: string) {
    if (!s) return '—'
    try {
      return new Date(s).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
    } catch { return s }
  }
  function fmtMonths(n?: number) {
    if (!n) return null
    if (n >= 12) {
      const y = Math.floor(n / 12)
      const m = n % 12
      return m ? `${y} г ${m} мес` : `${y} ${y === 1 ? 'год' : y < 5 ? 'года' : 'лет'}`
    }
    return `${n} мес`
  }

  const length = fmtMonths(attr.min_length === attr.max_length ? attr.min_length : (attr.max_length || attr.min_length))

  return (
    <div className="app">
      <CuratorSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="universities" />
      <div className="main">
        <div className="topbar" style={{ gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <Link href="/curator/universities" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 13, whiteSpace: 'nowrap' }}>
              &larr; База программ
            </Link>
            <span style={{ color: 'var(--bor2)' }}>/</span>
            <Link
              href={`/curator/universities/${school.id}`}
              style={{
                color: 'var(--muted)', textDecoration: 'none', fontSize: 13,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {school.name}
            </Link>
            <span style={{ color: 'var(--bor2)' }}>/</span>
            <span className="pt" style={{
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{program.name}</span>
          </div>
        </div>

        <div style={{ padding: '20px 28px 40px' }}>
          {/* Шапка программы */}
          <div style={{
            background: 'var(--surf)',
            border: '1px solid var(--bor)',
            borderRadius: 14,
            padding: 20,
            marginBottom: 16,
            boxShadow: 'var(--sh)',
          }}>
            {/* School row */}
            <Link
              href={`/curator/universities/${school.id}`}
              style={{
                display: 'flex', gap: 12, alignItems: 'center',
                textDecoration: 'none', color: 'inherit',
                paddingBottom: 12, marginBottom: 14,
                borderBottom: '1px solid var(--bor)',
              }}
            >
              {school.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={school.logo_url}
                  alt={school.name}
                  style={{
                    width: 48, height: 48, borderRadius: 10,
                    objectFit: 'contain', background: '#fff',
                    border: '1px solid var(--bor)', flexShrink: 0,
                  }}
                />
              ) : (
                <div style={{
                  width: 48, height: 48, borderRadius: 10, flexShrink: 0,
                  background: 'var(--purple)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, fontWeight: 700,
                }}>
                  {(school.name || '?').trim()[0]?.toUpperCase() || '?'}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                  {school.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  📍 {countryLabel}{school.city ? `, ${school.city}` : ''}{school.address ? `, ${school.address}` : ''}
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--purple)' }}>
                К вузу →
              </span>
            </Link>

            {/* Level */}
            {levelText && (
              <div style={{
                fontSize: 10, fontWeight: 700, color: 'var(--purple)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                marginBottom: 8,
              }}>
                {levelText}
              </div>
            )}

            {/* Program name */}
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
              {program.name}
            </h1>

            {/* Tags */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              {(attr.pgwp_participating || attr.pgwp_visible) && (
                <Tag color="var(--green)">PGWP</Tag>
              )}
              {coopLen > 0 && <Tag color="#0088cc">Co-op {coopLen} мес</Tag>}
              {attr.bypass_eligibility && <Tag color="var(--gold)">Conditional Offer</Tag>}
              {delivery === 'in_class' && <Tag color="var(--muted)">В кампусе</Tag>}
              {delivery === 'online' && <Tag color="var(--muted)">Онлайн</Tag>}
              {language && <Tag color="var(--muted)">{language}</Tag>}
            </div>

            {/* Action */}
            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <AddToShortlistButton
                schoolId={school.id}
                programId={program.id}
                myClients={myClients ?? []}
              />
              <Link
                href={`/curator/universities/${school.id}`}
                className="btn-s"
                style={{ fontSize: 12, textDecoration: 'none' }}
              >
                Все программы вуза →
              </Link>
              <FillProgramButton programId={program.id} hasData={!!curatorData} />
              {curatorData?.last_updated_at && (
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
                  {lastUpdatedByName ? `Обновил ${lastUpdatedByName}` : 'Обновлено'} · {relativeTime(curatorData.last_updated_at)}
                </span>
              )}
            </div>
          </div>

          {/* ИИ-данные */}
          {curatorData && (
            <>
              <CuratorDataSummary data={curatorData} levelText={levelText} />
              <AdmissionRequirements data={curatorData} />
              {curatorData.pgwp_text && <PGWPCard text={curatorData.pgwp_text} eligible={curatorData.pgwp_eligible} />}
              {Array.isArray(curatorData.source_urls) && curatorData.source_urls.length > 0 && (
                <SourceList urls={curatorData.source_urls as string[]} />
              )}
            </>
          )}
          {!curatorData && (
            <div style={{
              ...cardStyle, textAlign: 'center', padding: 32, marginBottom: 16,
              background: 'rgba(177,94,204,.04)', border: '1px dashed rgba(177,94,204,.3)',
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                🤖 Информация ещё не заполнена
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Нажми «Заполнить через ИИ» выше — агент найдёт требования, цены и сроки с официального сайта вуза. Занимает 15-30 сек.
              </div>
            </div>
          )}

          {/* Два колоночный блок: метрики + доп. инфа */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }} className="prog-grid">
            <style>{`
              @media (max-width: 900px) {
                .prog-grid { grid-template-columns: 1fr !important; }
              }
            `}</style>

            <div style={{ display: 'grid', gap: 12 }}>
              {/* Ключевые метрики */}
              <div style={cardStyle}>
                <div style={sectionTitle}>Ключевые параметры</div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: 14,
                }}>
                  <Metric label="Earliest intake" value={fmtDate(intake)} />
                  <Metric label="Deadline" value={fmtDate(deadline)} />
                  <Metric label="Стоимость" value={`${fmt(tuition)} ${currency}`} big />
                  <Metric label="Взнос" value={`${fmt(appFee)} ${currency}`} />
                  {length && <Metric label="Длительность" value={length} />}
                  {attr.length_breakdown && <Metric label="Формат длины" value={attr.length_breakdown} />}
                </div>
              </div>

              {/* Описание */}
              {description && (
                <div style={cardStyle}>
                  <div style={sectionTitle}>Описание программы</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                    {description}
                  </div>
                </div>
              )}

              {/* Прочие сборы */}
              {otherFees.length > 0 && (
                <div style={cardStyle}>
                  <div style={sectionTitle}>Прочие сборы</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>
                    {otherFees.map((fee, i) => (
                      <li key={i}>{fee}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
              <div style={cardStyle}>
                <div style={sectionTitle}>Информация</div>
                <div className="ir"><span className="ik">Program ID</span><span className="iv">#{program.id}</span></div>
                {attr.short_name && <div className="ir"><span className="ik">Short name</span><span className="iv">{attr.short_name}</span></div>}
                {levelText && <div className="ir"><span className="ik">Уровень</span><span className="iv">{levelText}</span></div>}
                {language && <div className="ir"><span className="ik">Язык</span><span className="iv">{language}</span></div>}
                {delivery && <div className="ir"><span className="ik">Формат</span><span className="iv">{deliveryLabel(delivery)}</span></div>}
              </div>

              <div style={cardStyle}>
                <div style={sectionTitle}>Финансы</div>
                {tuition != null && (
                  <div className="ir"><span className="ik">Обучение</span><span className="iv">{fmt(tuition)} {currency}</span></div>
                )}
                {appFee != null && (
                  <div className="ir"><span className="ik">Подача заявки</span><span className="iv">{fmt(appFee)} {currency}</span></div>
                )}
                {school.cost_of_living != null && (
                  <div className="ir"><span className="ik">Жизнь (вуз)</span><span className="iv">{fmt(school.cost_of_living)} {currency}/год</span></div>
                )}
                {school.avg_tuition != null && (
                  <div className="ir"><span className="ik">Средняя цена в вузе</span><span className="iv">{fmt(school.avg_tuition)} {currency}/год</span></div>
                )}
              </div>

              <div style={cardStyle}>
                <div style={sectionTitle}>Возможности</div>
                <FeatureLine on={!!(attr.pgwp_participating || attr.pgwp_visible)} label="Право на рабочую визу (PGWP)" />
                <FeatureLine on={coopLen > 0} label={`Co-op / стажировка${coopLen > 0 ? ` (${coopLen} мес)` : ''}`} />
                <FeatureLine on={!!attr.bypass_eligibility} label="Условный оффер (Conditional)" />
                <FeatureLine on={!!attr.ab_app_creation_enabled} label="Можно подать через ApplyBoard" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 20,
      fontSize: 10,
      fontWeight: 700,
      color,
      background: `color-mix(in srgb, ${color} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      letterSpacing: '0.03em',
      textTransform: 'uppercase',
    }}>{children}</span>
  )
}

function Metric({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <div style={{
        fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase',
        letterSpacing: '0.05em', fontWeight: 600, marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontSize: big ? 16 : 13, fontWeight: 700, color: 'var(--text)',
      }}>{value}</div>
    </div>
  )
}

function FeatureLine({ on, label }: { on: boolean; label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '7px 0',
      borderBottom: '1px solid var(--bor)',
      fontSize: 12,
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        background: on ? 'rgba(22,163,97,.15)' : 'var(--bor)',
        color: on ? 'var(--green)' : 'var(--muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700,
      }}>
        {on ? '✓' : '—'}
      </div>
      <span style={{ color: on ? 'var(--text)' : 'var(--muted)' }}>{label}</span>
    </div>
  )
}

function deliveryLabel(d: string): string {
  if (d === 'in_class') return 'В кампусе'
  if (d === 'online') return 'Онлайн'
  if (d === 'blended' || d === 'hybrid') return 'Смешанный'
  return d
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'только что'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч назад`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} дн назад`
  return new Date(iso).toLocaleDateString('ru', { day: 'numeric', month: 'short' })
}

/* ─── ИИ-данные ─── */

function CuratorDataSummary({ data, levelText }: { data: any; levelText?: string }) {
  const rows: { icon: string; value: string; label: string }[] = []
  if (levelText) rows.push({ icon: '🎓', value: levelText, label: 'Program Level' })
  if (data.program_length_text) rows.push({ icon: '🗓', value: data.program_length_text, label: 'Program Length' })
  if (data.cost_of_living_label) rows.push({ icon: '🏠', value: data.cost_of_living_label, label: 'Cost of Living' })
  if (data.gross_tuition_label) rows.push({ icon: '💵', value: data.gross_tuition_label, label: 'Gross Tuition' })
  if (data.application_fee_label) rows.push({ icon: '📝', value: data.application_fee_label, label: 'Application Fee' })

  const otherFees: any[] = Array.isArray(data.other_fees) ? data.other_fees : []

  if (rows.length === 0 && otherFees.length === 0) return null

  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <div style={sectionTitle}>Сводка программы (ИИ)</div>
      <div style={{ display: 'grid', gap: 14 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'var(--pl)', color: 'var(--purple)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, flexShrink: 0,
            }}>
              {r.icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{r.value}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{r.label}</div>
            </div>
          </div>
        ))}
      </div>

      {otherFees.length > 0 && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--bor)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Other Fees</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {otherFees.map((f, i) => {
              const amt = f?.amount != null ? `${f.amount}${f.currency ? ` ${f.currency}` : ''}` : ''
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>{f?.label || '—'}{f?.note ? ` (${f.note})` : ''}</span>
                  {amt && <span style={{ fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{amt}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function AdmissionRequirements({ data }: { data: any }) {
  const hasAcademic = data.min_education_level || data.min_gpa_percent != null
  const langs: { key: string; label: string; value: any }[] = [
    { key: 'ielts', label: 'IELTS', value: data.ielts_min },
    { key: 'toefl', label: 'TOEFL', value: data.toefl_min },
    { key: 'pte', label: 'PTE', value: data.pte_min },
    { key: 'duolingo', label: 'Duolingo', value: data.duolingo_min },
  ].filter(l => l.value != null)

  if (!hasAcademic && langs.length === 0) return null

  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--pl)', color: 'var(--purple)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14,
        }}>📊</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Admission Requirements</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
            Может варьироваться в зависимости от гражданства и академической истории студента.
          </div>
        </div>
      </div>

      {hasAcademic && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Academic Background
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 10,
          }}>
            {data.min_education_level && (
              <RequirementCard label="Minimum Level of Education Completed" value={data.min_education_level} />
            )}
            {data.min_gpa_percent != null && (
              <RequirementCard label="Minimum GPA" value={`${Number(data.min_gpa_percent).toFixed(1)}%`} />
            )}
          </div>
        </div>
      )}

      {langs.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Minimum Language Test Scores
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
          }}>
            {langs.map(l => (
              <RequirementCard key={l.key} label={l.label} value={String(l.value)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RequirementCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      border: '1px solid var(--bor)',
      borderRadius: 10,
      padding: '10px 14px',
      background: 'var(--surf2)',
    }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{value}</div>
    </div>
  )
}

function PGWPCard({ text, eligible }: { text: string; eligible?: boolean | null }) {
  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>🛂</span>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Post-Study Work Visa</div>
        {eligible === true && (
          <span style={{
            padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
            color: 'var(--green)', background: 'rgba(22,163,97,.1)',
            border: '1px solid rgba(22,163,97,.25)',
          }}>Eligible</span>
        )}
        {eligible === false && (
          <span style={{
            padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
            color: 'var(--red)', background: 'rgba(220,53,69,.1)',
            border: '1px solid rgba(220,53,69,.25)',
          }}>Not eligible</span>
        )}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
        {text}
      </div>
    </div>
  )
}

function SourceList({ urls }: { urls: string[] }) {
  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <div style={sectionTitle}>Источники (ИИ)</div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.8 }}>
        {urls.slice(0, 8).map((u, i) => (
          <li key={i} style={{ color: 'var(--text)' }}>
            <a href={u} target="_blank" rel="noreferrer" style={{ color: 'var(--purple)', wordBreak: 'break-all' }}>
              {u}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
