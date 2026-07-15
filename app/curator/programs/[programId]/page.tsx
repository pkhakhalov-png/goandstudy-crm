import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createParserClient } from '@/lib/supabase/parser'
import { CuratorSidebar } from '../../CuratorSidebar'
import { AddToShortlistButton } from '../../universities/[schoolId]/AddToShortlistButton'
import { FillProgramButton } from './FillProgramButton'
import { BackButton } from '../../universities/[schoolId]/BackButton'
import { EditModeProvider, EditModeToggle } from '@/app/_shared/CuratorEdit/EditMode'
import { ProgramEditPanel } from './ProgramEditPanel'
import { applyOverrides } from '@/lib/curator-overrides'

export const dynamic = 'force-dynamic'

const COUNTRY_LABEL: Record<string, string> = {
  ca: 'Канада', au: 'Австралия', gb: 'Великобритания', de: 'Германия',
  us: 'США', ie: 'Ирландия', pt: 'Португалия', si: 'Словения', tr: 'Турция',
  it: 'Италия', se: 'Швеция', fi: 'Финляндия',
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
  searchParams,
}: {
  params: Promise<{ programId: string }>
  searchParams: Promise<{ asClient?: string; clientId?: string }>
}) {
  const { programId } = await params
  const sp = await searchParams
  const asClient = sp.asClient === '1'
  const id = Number(programId)
  if (!id) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  // Клиенту разрешён read-only просмотр программы (asClient=1)
  if (profile?.role !== 'curator' && profile?.role !== 'admin' && profile?.role !== 'rop' && profile?.role !== 'client') redirect('/login')

  const parser = createParserClient()
  const { data: programRaw } = await parser
    .from('programs')
    .select(`
      *,
      school:schools(id, name, logo_url, country_code, city, province, address, institution_type, avg_tuition, cost_of_living, currency_of_fees, qs_rank, raw_data)
    `)
    .eq('id', id)
    .maybeSingle()

  if (!programRaw) notFound()

  // Применяем curator_overrides поверх — оригинал из парсера + правки куратора.
  const program: any = applyOverrides(programRaw)
  const school: any = applyOverrides(programRaw.school || {})
  // attr — мутируемая копия, чтобы overrides могли менять вложенные поля
  // (earliest_intake.submission_deadline, currency_of_fees.code, min/max_length).
  const attr: any = { ...(program.raw_data?.attributes || {}) }
  const schoolRaw = school.raw_data?.attributes || {}

  // Клиенты куратора + заполненные ИИ данные
  const admin = await createAdminClient()
  const { data: curatorRec } = await admin
    .from('curators').select('id').eq('user_id', user.id).maybeSingle()
  const curatorId = curatorRec?.id
  const [{ data: myClients }, { data: curatorDataDb }] = await Promise.all([
    curatorId
      ? admin.from('clients').select('id, name, country').eq('curator_id', curatorId).eq('status', 'active').order('name')
      : Promise.resolve({ data: [] as { id: number; name: string; country?: string | null }[] }),
    admin.from('program_curator_data').select('*').eq('program_id', id).maybeSingle(),
  ])

  // EditPanel пишет правки плоско в raw_data.curator_overrides[field], а
  // рендерер читает их по другим путям (program.program_description, .degree_text,
  // attr.earliest_intake.submission_deadline, curatorData.ielts_min и т.д.).
  // Без этого маппинга правки сохраняются в БД, но на карточке не появляются.
  const overrides = (programRaw.raw_data?.curator_overrides || {}) as Record<string, any>
  let curatorData: any = curatorDataDb
  const ensureCD = () => { if (!curatorData) curatorData = {}; return curatorData }

  if (overrides.description) program.program_description = overrides.description
  if (overrides.level_text) program.degree_text = overrides.level_text
  if (overrides.language) program.language_text = overrides.language
  if (overrides.length_text) {
    program.duration_text = overrides.length_text
    if (curatorData) curatorData.program_length_text = overrides.length_text
  }
  if (overrides.min_length_months != null && overrides.min_length_months !== '') {
    const n = Number(overrides.min_length_months)
    if (Number.isFinite(n)) { attr.min_length = n; attr.max_length = n }
  }
  if (overrides.intake_text) {
    program.start_date_text = overrides.intake_text
    if (curatorData) curatorData.earliest_intake_label = overrides.intake_text
  }
  if (overrides.application_deadline) {
    attr.earliest_intake = { ...(attr.earliest_intake || {}), submission_deadline: overrides.application_deadline }
    // deadlineText = curatorData.deadline_label || program.deadline_text || fmtDate(deadline).
    // Обнуляем оба верхних приоритета, иначе сид-текст deadline_text («Уточняется…»)
    // перекрывает правку куратора и она не видна на карточке.
    program.deadline_text = null
    if (curatorData) curatorData.deadline_label = null
  }
  if (overrides.tuition != null && overrides.tuition !== '') {
    const n = Number(overrides.tuition)
    if (Number.isFinite(n)) {
      program.tuition = n
      program.tuition_text = null
      if (curatorData) curatorData.gross_tuition_label = null
    }
  }
  if (overrides.currency) {
    attr.currency_of_fees = { ...(attr.currency_of_fees || {}), code: overrides.currency }
  }
  if (overrides.application_fee != null && overrides.application_fee !== '') {
    const n = Number(overrides.application_fee)
    if (Number.isFinite(n)) {
      program.application_fee = n
      if (curatorData) curatorData.application_fee_label = null
    }
  }
  if (overrides.tuition_deposit != null && overrides.tuition_deposit !== '') {
    const n = Number(overrides.tuition_deposit)
    if (Number.isFinite(n)) attr.tuition_deposit = { ...(attr.tuition_deposit || {}), amount: n }
  }
  // Поля Admission Requirements рендерятся из program_curator_data — мерджим overrides сверху.
  if (overrides.min_education_level) ensureCD().min_education_level = String(overrides.min_education_level)
  if (overrides.min_gpa_percent != null && overrides.min_gpa_percent !== '') {
    const n = Number(overrides.min_gpa_percent); if (Number.isFinite(n)) ensureCD().min_gpa_percent = n
  }
  for (const k of ['ielts_min', 'toefl_min', 'pte_min', 'duolingo_min']) {
    const v = overrides[k]
    if (v != null && v !== '') {
      const n = Number(v); if (Number.isFinite(n)) ensureCD()[k] = n
    }
  }
  // Заметка куратора и список требований — редактируются вручную в ProgramEditPanel.
  // curator_note applyOverrides кладёт как строку (ок). entry_requirements хранится в
  // override строкой (пункты через \n) — конвертируем обратно в массив для рендера <ul>.
  if (overrides.curator_note) program.curator_note = String(overrides.curator_note)
  if (overrides.entry_requirements != null && overrides.entry_requirements !== '') {
    program.entry_requirements = String(overrides.entry_requirements)
      .split('\n').map((s: string) => s.trim()).filter(Boolean)
  }

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

  const isCurator = program.source === 'curator_gh'
  const levelText = program.degree_text || attr.level_text || program.program_level_text
  const tuition = program.tuition
  const tuitionText = program.tuition_text
  const currency = attr.currency_of_fees?.code || attr.currency?.code
    || schoolRaw.currency_of_fees?.code || program.currency || ''
  const appFee = program.application_fee ?? attr.application_fee
  const intake = attr.earliest_intake?.start_date || program.earliest_intake_date
  const deadline = attr.earliest_intake?.submission_deadline
  const coopLen = attr.coop_length
  const delivery = attr.delivery_method
  const language = program.language_text || attr.language_of_instruction || program.language
  const description = program.program_description
    || (attr.description
      ? attr.description.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
      : '')
  const otherFees: string[] = Array.isArray(attr.other_fees) ? attr.other_fees : []
  // Куратор-данные: считаем что они есть если программа из curator_gh
  const hasCuratorBdData = isCurator || program.curator_note || program.scholarships_text || (program.entry_requirements?.length || 0) > 0

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
    <EditModeProvider viewerRole={profile?.role || 'client'} asClient={asClient}>
    <div className="app">
      {!asClient && (
        <CuratorSidebar userName={profile?.name || ''} userEmail={user.email || ''} initials={initials} activePage="universities" />
      )}
      <div className="main">
        <div className="topbar" style={{ gap: 12, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <Link
              href={asClient
                ? `/curator/universities/${school.id}?asClient=1${sp.clientId ? `&clientId=${sp.clientId}` : ''}`
                : `/curator/universities/${school.id}`}
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
          {!asClient && <EditModeToggle />}
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
              href={asClient
                ? `/curator/universities/${school.id}?asClient=1${sp.clientId ? `&clientId=${sp.clientId}` : ''}`
                : `/curator/universities/${school.id}`}
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
              {(() => {
                const isValid = (n: any) => typeof n === 'number' && n > 0 && n < 9999
                const ex = (school.raw_data as any)?.curator_extras || {}
                let rank: { source: string; value: number } | null = null
                if (isValid(school.qs_rank)) rank = { source: 'QS', value: school.qs_rank }
                else if (isValid(ex.the_rank)) rank = { source: 'THE', value: ex.the_rank }
                else if (isValid(ex.arwu_rank)) rank = { source: 'ARWU', value: ex.arwu_rank }
                else if (isValid(ex.usnews_rank)) rank = { source: 'US News', value: ex.usnews_rank }
                else if (isValid(ex.webometrics_rank)) rank = { source: 'Webometrics', value: ex.webometrics_rank }
                if (!rank) return null
                return (
                  <div title={`Позиция в рейтинге ${rank.source}`} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    padding: '4px 10px', borderRadius: 8,
                    background: 'rgba(177,94,204,.08)', border: '1px solid rgba(177,94,204,.25)',
                    color: 'var(--purple)', whiteSpace: 'nowrap',
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.8 }}>{rank.source}</span>
                    <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>#{rank.value}</span>
                  </div>
                )
              })()}
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                fontSize: 14, fontWeight: 600, color: '#fff',
                background: 'var(--purple)',
                padding: '10px 18px', borderRadius: 10,
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(177,94,204,.35)',
              }}>
                Посмотреть вуз
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
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
              {!asClient && (
                <AddToShortlistButton
                  schoolId={school.id}
                  programId={program.id}
                  myClients={myClients ?? []}
                />
              )}
              <Link
                href={asClient ? `/curator/universities/${school.id}?asClient=1${sp.clientId ? `&clientId=${sp.clientId}` : ''}` : `/curator/universities/${school.id}`}
                className="btn-s"
                style={{ fontSize: 12, textDecoration: 'none' }}
              >
                Все программы вуза →
              </Link>
              {!asClient && <FillProgramButton programId={program.id} hasData={!!curatorData} />}
              {!asClient && curatorData?.last_updated_at && (
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
                  {lastUpdatedByName ? `Обновил ${lastUpdatedByName}` : 'Обновлено'} · {relativeTime(curatorData.last_updated_at)}
                </span>
              )}
            </div>
          </div>

          {!curatorData && !hasCuratorBdData && !asClient && (
            <div style={{
              ...cardStyle, textAlign: 'center', padding: 24, marginBottom: 16,
              background: 'rgba(177,94,204,.04)', border: '1px dashed rgba(177,94,204,.3)',
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                Детали программы ещё не заполнены
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Нажми «Заполнить через ИИ» выше — агент найдёт требования, цены и сроки с официального сайта вуза (15-30 сек).
              </div>
            </div>
          )}

          {/* Двух-колоночная раскладка: описание слева-широко, сводка справа */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }} className="prog-grid">
            <style>{`
              @media (max-width: 900px) {
                .prog-grid { grid-template-columns: 1fr !important; }
              }
            `}</style>

            {/* LEFT — куратор-блоки + описание + admission + pgwp */}
            <div style={{ display: 'grid', gap: 12 }}>
              {/* BD-куратор-блоки сверху слева (если есть) */}
              {program.curator_note && (
                <div style={{ ...cardStyle, borderLeft: '4px solid var(--purple, #B15ECC)' }}>
                  <div style={sectionTitle}>Заметка куратора</div>
                  <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                    {program.curator_note}
                  </div>
                </div>
              )}
              {(program.entry_requirements?.length || 0) > 0 && (
                <div style={cardStyle}>
                  <div style={sectionTitle}>Требования к поступлению</div>
                  <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>
                    {program.entry_requirements.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              {(program.accommodation_options?.length || 0) > 0 && (
                <div style={cardStyle}>
                  <div style={sectionTitle}>Варианты проживания</div>
                  <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>
                    {program.accommodation_options.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              {program.scholarships_text && (
                <div style={cardStyle}>
                  <div style={sectionTitle}>Гранты и стипендии</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>
                    {program.scholarships_text}
                  </div>
                </div>
              )}

              {description && (
                <div style={cardStyle}>
                  <div style={sectionTitle}>Описание программы</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                    {description}
                  </div>
                </div>
              )}

              {curatorData && <AdmissionRequirements data={curatorData} />}
              {curatorData?.pgwp_text && (
                <PGWPCard text={curatorData.pgwp_text} eligible={curatorData.pgwp_eligible} />
              )}
            </div>

            {/* RIGHT — сводка + инфо + возможности + источники */}
            <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
              <SummaryBig
                levelText={levelText}
                lengthText={curatorData?.program_length_text || program.duration_text || length}
                intakeText={curatorData?.earliest_intake_label || program.start_date_text || (intake ? fmtDate(intake) : null)}
                deadlineText={curatorData?.deadline_label || program.deadline_text || (deadline ? fmtDate(deadline) : null)}
                costOfLiving={curatorData?.cost_of_living_label
                  || (program.living_cost_text ? `${program.living_cost_text}${program.living_cost_period ? ' ' + program.living_cost_period : ''}` : null)
                  || (school.cost_of_living != null ? `${fmt(school.cost_of_living)} ${currency} / год` : null)}
                grossTuition={curatorData?.gross_tuition_label
                  || tuitionText
                  || (tuition != null ? `${fmt(tuition)} ${currency} / год` : null)}
                applicationFee={curatorData?.application_fee_label
                  || (appFee != null ? `${fmt(appFee)} ${currency}` : null)}
                otherFees={curatorData?.other_fees || null}
                rawOtherFees={otherFees}
              />

              <div style={cardStyle}>
                <div style={sectionTitle}>Информация</div>
                <div className="ir"><span className="ik">Program ID</span><span className="iv">#{program.id}</span></div>
                {attr.short_name && <div className="ir"><span className="ik">Short name</span><span className="iv">{attr.short_name}</span></div>}
                {language && <div className="ir"><span className="ik">Язык</span><span className="iv">{language}</span></div>}
                {delivery && <div className="ir"><span className="ik">Формат</span><span className="iv">{deliveryLabel(delivery)}</span></div>}
              </div>

              <div style={cardStyle}>
                <div style={sectionTitle}>Возможности</div>
                <FeatureLine
                  on={curatorData?.pgwp_eligible ?? !!(attr.pgwp_participating || attr.pgwp_visible)}
                  label="Право на рабочую визу (PGWP)"
                />
                <FeatureLine
                  on={curatorData?.coop_available ?? coopLen > 0}
                  label={`Co-op / стажировка${coopLen > 0 ? ` (${coopLen} мес)` : ''}`}
                />
                <FeatureLine
                  on={curatorData?.conditional_offer_available ?? !!attr.bypass_eligibility}
                  label="Условный оффер (Conditional)"
                />
              </div>

              {Array.isArray(curatorData?.source_urls) && curatorData!.source_urls.length > 0 && (
                <SourceList urls={curatorData!.source_urls as string[]} />
              )}
            </div>
          </div>
        </div>
      </div>
      {!asClient && <ProgramEditPanel programId={program.id} program={program} curatorData={curatorData} />}
    </div>
    </EditModeProvider>
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

/* ─── Сводка (ApplyBoard-style: крупные цифры, иконки слева) ─── */

function SummaryBig({
  levelText, lengthText, intakeText, deadlineText,
  costOfLiving, grossTuition, applicationFee,
  otherFees, rawOtherFees,
}: {
  levelText?: string | null
  lengthText?: string | null
  intakeText?: string | null
  deadlineText?: string | null
  costOfLiving?: string | null
  grossTuition?: string | null
  applicationFee?: string | null
  otherFees?: any[] | null
  rawOtherFees?: string[]
}) {
  const rows: { icon: React.ReactNode; value: string; label: string }[] = []
  if (levelText) rows.push({ icon: <IconDegree />, value: levelText, label: 'Program Level' })
  if (lengthText) rows.push({ icon: <IconHourglass />, value: lengthText, label: 'Program Length' })
  if (intakeText) rows.push({ icon: <IconCalendar />, value: intakeText, label: 'Earliest Intake' })
  if (deadlineText) rows.push({ icon: <IconClock />, value: deadlineText, label: 'Application Deadline' })
  if (costOfLiving) rows.push({ icon: <IconHouse />, value: costOfLiving, label: 'Cost of Living' })
  if (grossTuition) rows.push({ icon: <IconSchool />, value: grossTuition, label: 'Gross Tuition' })
  if (applicationFee) rows.push({ icon: <IconFee />, value: applicationFee, label: 'Application Fee' })

  const fees = Array.isArray(otherFees) && otherFees.length > 0
    ? otherFees.map(f => ({
        label: f?.label || '—',
        amount: f?.amount != null ? `${f.amount}${f.currency ? ` ${f.currency}` : ''}` : '',
        note: f?.note || null,
      }))
    : (rawOtherFees || []).map(s => ({ label: s, amount: '', note: null }))

  if (rows.length === 0 && fees.length === 0) return null

  return (
    <div style={cardStyle}>
      <div style={sectionTitle}>Сводка программы</div>
      <div style={{ display: 'grid', gap: 14 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'var(--surf2)',
              border: '1px solid var(--bor)',
              color: 'var(--text)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {r.icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 15, fontWeight: 700, color: 'var(--text)',
                lineHeight: 1.25, letterSpacing: '-0.01em',
              }}>
                {r.value}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{r.label}</div>
            </div>
          </div>
        ))}
      </div>

      {fees.length > 0 && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--bor)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
            Other Fees
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {fees.map((f, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                gap: 10, fontSize: 12, alignItems: 'baseline',
              }}>
                <span style={{ color: 'var(--muted)' }}>
                  {f.label}{f.note ? ` (${f.note})` : ''}
                </span>
                {f.amount && (
                  <span style={{ fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    {f.amount}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── SVG иконки для Summary ─── */

const SVG = (d: string, extra?: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
    {extra}
  </svg>
)

function IconDegree() {
  return SVG('M6 3h10a2 2 0 012 2v14l-3-2-4 3-4-3-3 2V5a2 2 0 012-2z', <circle cx="15" cy="9" r="2" />)
}
function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </svg>
  )
}
function IconClock() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  )
}
function IconHourglass() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12M6 21h12" />
      <path d="M7 3v4c0 2.5 2.5 4 5 5 2.5 1 5 2.5 5 5v4" />
      <path d="M17 3v4c0 2.5-2.5 4-5 5-2.5 1-5 2.5-5 5v4" />
    </svg>
  )
}
function IconHouse() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v10h12V10" />
      <text x="12" y="17" fontSize="7" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">$</text>
    </svg>
  )
}
function IconSchool() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 9l7-5 7 5v10H5z" />
      <path d="M9 19v-5h6v5" />
      <circle cx="17" cy="17" r="3" strokeWidth="1.6" />
      <text x="17" y="18.5" fontSize="4.5" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">$</text>
    </svg>
  )
}
function IconFee() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 13l2-9h14l2 9" />
      <path d="M3 13h18l-2 7H5z" />
      <circle cx="12" cy="16" r="2.5" />
    </svg>
  )
}

function IconChart() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="7" y1="18" x2="7" y2="11" />
      <line x1="12" y1="18" x2="12" y2="6" />
      <line x1="17" y1="18" x2="17" y2="13" />
      <line x1="4" y1="20" x2="20" y2="20" />
    </svg>
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
    <div style={cardStyle} className="adm-card">
      <style>{`
        @media (max-width: 640px) {
          .adm-card .adm-lang { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .adm-card .adm-academic { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--surf2)',
          border: '1px solid var(--bor)',
          color: 'var(--text)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <IconChart />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Admission Requirements</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
            Может варьироваться в зависимости от гражданства и академической истории студента.
          </div>
        </div>
      </div>

      {hasAcademic && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Academic Background
          </div>
          <div className="adm-academic" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
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
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Minimum Language Test Scores
          </div>
          <div className="adm-lang" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
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
      <div style={sectionTitle}>Источники</div>
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
