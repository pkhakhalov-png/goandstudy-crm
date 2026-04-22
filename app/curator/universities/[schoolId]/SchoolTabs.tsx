'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AddToShortlistButton } from './AddToShortlistButton'

interface Props {
  school: any
  programs: any[]
  myClients: { id: number; name: string; country?: string | null }[]
}

type Tab = 'overview' | 'features' | 'location' | 'programs'

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

export function SchoolTabs({ school, programs, myClients }: Props) {
  const [tab, setTab] = useState<Tab>('overview')
  const raw = school.raw_data?.attributes || {}

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Обзор' },
    { key: 'features', label: 'Возможности' },
    { key: 'location', label: 'Локация' },
    { key: 'programs', label: `Программы`, count: programs.length },
  ]

  return (
    <div>
      {/* Tab bar — sticky, чтобы не терялись при скролле */}
      <div style={{
        display: 'flex', gap: 4, borderBottom: '1px solid var(--bor)',
        marginBottom: 20, overflowX: 'auto',
        position: 'sticky', top: 56, zIndex: 5,
        background: 'var(--bg)',
        paddingTop: 8,
        marginLeft: -4, paddingLeft: 4,
      }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'transparent',
              fontSize: 13,
              fontWeight: 600,
              color: tab === t.key ? 'var(--purple)' : 'var(--muted)',
              borderBottom: `2px solid ${tab === t.key ? 'var(--purple)' : 'transparent'}`,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'inherit',
              marginBottom: -1,
            }}
          >
            {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab school={school} raw={raw} />}
      {tab === 'features' && <FeaturesTab school={school} programs={programs} />}
      {tab === 'location' && <LocationTab school={school} raw={raw} />}
      {tab === 'programs' && (
        <ProgramsTab school={school} programs={programs} myClients={myClients} />
      )}
    </div>
  )
}

/* ─── Overview ─── */

function OverviewTab({ school, raw }: { school: any; raw: any }) {
  const about = school.about || raw.about || school.description
  const topDisc = Array.isArray(school.top_disciplines) ? school.top_disciplines : []
  const programLevelCounts = school.program_level_counts || raw.program_level_counts
  const applicationFeeRange = school.application_fee_range || raw.application_fee_range
  const avgProgramLength = school.avg_program_length || raw.avg_program_length
  const costOfLivingDetails = school.cost_of_living_details || raw.cost_of_living_details
  const currency = raw.currency_of_fees?.code || school.currency_of_fees?.code || school.currency || ''
  const intakesSummary = school.intakes_summary || raw.intakes_summary
  const institutionType = school.institution_type || raw.institution_type
  const foundedIn = school.founded_in || raw.founded_in
  const dliNumber = school.dli_number || raw.dli_number
  const pgwpCount = school.pgwp_programs_count
  const processingTime = school.processing_time || raw.processing_time
  const videoLink = school.video_link || raw.video_link

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }} className="overview-grid">
      <style>{`
        @media (max-width: 900px) {
          .overview-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={cardStyle}>
          <div style={sectionTitle}>О вузе</div>
          {about ? (
            <AboutBlock html={about} />
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Описание не добавлено.</div>
          )}
        </div>

        {videoLink && (
          <div style={cardStyle}>
            <div style={sectionTitle}>Видео-тур</div>
            <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 10, overflow: 'hidden', background: '#000' }}>
              <iframe
                src={videoLink}
                title="Video tour"
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                allowFullScreen
              />
            </div>
          </div>
        )}

        {programLevelCounts && typeof programLevelCounts === 'object' && (
          <div style={cardStyle}>
            <div style={sectionTitle}>Программы по уровням</div>
            <ProgramLevelCounts counts={programLevelCounts} />
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        <div style={cardStyle}>
          <div style={sectionTitle}>Основное</div>
          <InfoRow k="School ID" v={`#${school.id}`} />
          {foundedIn && <InfoRow k="Основан" v={String(foundedIn)} />}
          {institutionType && <InfoRow k="Тип" v={String(institutionType)} />}
          {dliNumber && <InfoRow k="DLI Number" v={String(dliNumber)} />}
          {school.school_group_id && <InfoRow k="Группа" v={`#${school.school_group_id}`} />}
        </div>

        <div style={cardStyle}>
          <div style={sectionTitle}>Стоимость</div>
          {school.avg_tuition != null && (
            <InfoRow k="Средняя цена" v={`${Math.round(Number(school.avg_tuition)).toLocaleString('ru')} ${currency}/год`} />
          )}
          {applicationFeeRange && (
            <InfoRow k="Взнос за заявку" v={formatFeeRange(applicationFeeRange, currency)} />
          )}
          {school.cost_of_living != null && (
            <InfoRow k="Жизнь" v={`${Math.round(Number(school.cost_of_living)).toLocaleString('ru')} ${currency}/год`} />
          )}
          {costOfLivingDetails && typeof costOfLivingDetails === 'object' && (
            <CostOfLivingDetails details={costOfLivingDetails} currency={currency} />
          )}
        </div>

        {(avgProgramLength || processingTime) && (
          <div style={cardStyle}>
            <div style={sectionTitle}>Длительность и сроки</div>
            {avgProgramLength?.undergraduate && (
              <InfoRow k="Бакалавриат" v={`${Math.round(Number(avgProgramLength.undergraduate))} мес`} />
            )}
            {avgProgramLength?.graduate && (
              <InfoRow k="Магистратура" v={`${Math.round(Number(avgProgramLength.graduate))} мес`} />
            )}
            {processingTime && <InfoRow k="Обработка документов" v={formatProcessingTime(processingTime)} />}
          </div>
        )}

        {(pgwpCount != null || intakesSummary) && (
          <div style={cardStyle}>
            <div style={sectionTitle}>Приёмная кампания</div>
            {pgwpCount != null && <InfoRow k="Программ с PGWP" v={String(pgwpCount)} />}
            {intakesSummary && <InfoRow k="Intake" v={formatIntakesSummary(intakesSummary)} />}
          </div>
        )}

        {topDisc.length > 0 && (
          <div style={cardStyle}>
            <div style={sectionTitle}>Топ направлений</div>
            <TopDisciplinesChart items={topDisc} />
          </div>
        )}
      </div>
    </div>
  )
}

function formatFeeRange(v: any, currency: string): string {
  if (typeof v === 'string' || typeof v === 'number') return `${Math.round(Number(v) || 0).toLocaleString('ru')} ${currency}`
  if (v.min != null && v.max != null) return `${Math.round(Number(v.min)).toLocaleString('ru')} – ${Math.round(Number(v.max)).toLocaleString('ru')} ${currency}`
  if (v.min != null) return `от ${Math.round(Number(v.min)).toLocaleString('ru')} ${currency}`
  if (v.max != null) return `до ${Math.round(Number(v.max)).toLocaleString('ru')} ${currency}`
  return '—'
}

function formatProcessingTime(v: any): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  // Значения в секундах? Если очень большое — в днях.
  if (n > 86400 * 2) return `${Math.round(n / 86400)} дн`
  return `${n}`
}

function formatIntakesSummary(v: any): string {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.slice(0, 3).join(', ')
  if (v.months && Array.isArray(v.months)) return v.months.slice(0, 3).join(', ')
  return JSON.stringify(v).slice(0, 60)
}

function CostOfLivingDetails({ details, currency }: { details: any; currency: string }) {
  const entries = Object.entries(details).slice(0, 5)
  return (
    <>
      {entries.map(([key, val]) => (
        <InfoRow
          key={key}
          k={key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          v={`${Math.round(Number(val) || 0).toLocaleString('ru')} ${currency}`}
        />
      ))}
    </>
  )
}

function ProgramLevelCounts({ counts }: { counts: Record<string, number> | any }) {
  const entries: [string, number][] = Object.entries(counts)
    .map(([k, v]) => [k, Number(v) || 0] as [string, number])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>Нет данных</div>
  const max = Math.max(...entries.map(([, v]) => v), 1)

  const LABEL: Record<string, string> = {
    bachelors: 'Бакалавриат',
    bachelor: 'Бакалавриат',
    masters_degree: 'Магистратура',
    masters: 'Магистратура',
    phd: 'PhD',
    doctoral: 'Докторантура',
    certificate: 'Сертификат',
    diploma: 'Диплом',
    english: 'ESL',
    pathway: 'Pathway',
    vocational: 'Профессиональное',
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {entries.map(([k, v]) => (
        <div key={k}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', fontSize: 11,
            marginBottom: 3, gap: 8,
          }}>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{LABEL[k.toLowerCase()] || k}</span>
            <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{v}</span>
          </div>
          <div style={{ height: 6, background: 'var(--bor)', borderRadius: 20, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${(v / max) * 100}%`,
              background: 'linear-gradient(90deg, var(--purple), #d47aff)',
              borderRadius: 20,
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function AboutBlock({ html }: { html: string }) {
  const [expanded, setExpanded] = useState(false)
  const MAX = 600
  const text = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  const isLong = text.length > MAX
  const displayed = expanded || !isLong ? text : text.slice(0, MAX) + '…'

  return (
    <div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
        {displayed}
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          style={{
            marginTop: 10, background: 'none', border: 'none',
            color: 'var(--purple)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', padding: 0, fontFamily: 'inherit',
          }}
        >
          {expanded ? 'Свернуть' : 'Показать больше'}
        </button>
      )}
    </div>
  )
}

function InfoRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="ir">
      <span className="ik">{k}</span>
      <span className="iv">{v}</span>
    </div>
  )
}

function TopDisciplinesChart({ items }: { items: any[] }) {
  const max = Math.max(...items.map(i => Number(i.count) || 0), 1)
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {items.slice(0, 5).map((d, idx) => {
        const count = Number(d.count) || 0
        const pct = (count / max) * 100
        return (
          <div key={idx}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', fontSize: 11,
              marginBottom: 3, gap: 8,
            }}>
              <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
              <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{count}</span>
            </div>
            <div style={{ height: 6, background: 'var(--bor)', borderRadius: 20, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`,
                background: 'linear-gradient(90deg, var(--purple), #d47aff)',
                borderRadius: 20,
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Features ─── */

function FeaturesTab({ school, programs }: { school: any; programs: any[] }) {
  const f = school.features || {}
  const anyBypass = programs.some(p => p.raw_data?.attributes?.bypass_eligibility === true)

  const items = [
    {
      key: 'pgwp',
      title: 'Право на рабочую визу после учёбы (PGWP)',
      desc: 'Выпускники могут получить разрешение на работу после окончания программы.',
      on: !!f.pgwp_participating,
    },
    {
      key: 'coop',
      title: 'Co-op / Стажировки',
      desc: 'Программы включают оплачиваемую практику в партнёрских компаниях.',
      on: !!f.coop_participating,
    },
    {
      key: 'work_study',
      title: 'Работа во время учёбы',
      desc: 'Студентам разрешено работать на part-time во время семестров.',
      on: !!f.can_work_and_study,
    },
    {
      key: 'conditional',
      title: 'Conditional Offer Letter',
      desc: 'Вуз выдаёт условный оффер, если хотя бы одна программа поддерживает bypass eligibility.',
      on: anyBypass || !!f.conditional_acceptance,
    },
  ]

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.map(item => (
        <FeatureRow key={item.key} title={item.title} desc={item.desc} on={item.on} />
      ))}
    </div>
  )
}

function FeatureRow({ title, desc, on }: { title: string; desc: string; on: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        <div style={{
          width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
          background: on ? 'rgba(22,163,97,.15)' : 'var(--bor)',
          color: on ? 'var(--green)' : 'var(--muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700,
        }}>
          {on ? '✓' : '—'}
        </div>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          {title}
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 12, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</div>
      </button>
      {open && (
        <div style={{ padding: '0 18px 14px 54px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
          {desc}
        </div>
      )}
    </div>
  )
}

/* ─── Location ─── */

function LocationTab({ school, raw }: { school: any; raw: any }) {
  const lat = raw.latitude
  const lng = raw.longitude
  const address = [school.address, school.city, school.province, raw.postal_code].filter(Boolean).join(', ')

  return (
    <div style={cardStyle}>
      <div style={sectionTitle}>Адрес</div>
      <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 16 }}>
        {address || 'Адрес не указан'}
      </div>
      {lat && lng ? (
        <iframe
          title="map"
          width="100%"
          height="400"
          style={{ border: 0, borderRadius: 10 }}
          loading="lazy"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.02}%2C${lat - 0.015}%2C${lng + 0.02}%2C${lat + 0.015}&layer=mapnik&marker=${lat}%2C${lng}`}
        />
      ) : (
        <div style={{ color: 'var(--muted)', fontSize: 13, padding: 24, textAlign: 'center', border: '1px dashed var(--bor2)', borderRadius: 10 }}>
          Координаты не заданы
        </div>
      )}
    </div>
  )
}

/* ─── Programs ─── */

function ProgramsTab({ school, programs, myClients }: { school: any; programs: any[]; myClients: any[] }) {
  const [levelFilter, setLevelFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const currencyFromSchool = (school.raw_data as any)?.attributes?.currency_of_fees?.code

  const levels = Array.from(new Set(
    programs
      .map(p => p.raw_data?.attributes?.level_text)
      .filter(Boolean)
  )).sort()

  const q = search.trim().toLowerCase()
  const filtered = programs.filter(p => {
    if (levelFilter && p.raw_data?.attributes?.level_text !== levelFilter) return false
    if (q) {
      const name = (p.name || '').toLowerCase()
      const descr = (p.raw_data?.attributes?.description || '').toLowerCase()
      if (!name.includes(q) && !descr.includes(q)) return false
    }
    return true
  })

  if (programs.length === 0) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
        Для этого вуза пока нет программ в базе.
      </div>
    )
  }

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(240px, 1fr) minmax(160px, 0.6fr)',
        gap: 10, alignItems: 'center', marginBottom: 16,
      }} className="prog-filter-row">
        <style>{`
          @media (max-width: 700px) {
            .prog-filter-row { grid-template-columns: 1fr !important; }
          }
        `}</style>
        <div style={{ position: 'relative' }}>
          <svg
            viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
            style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              width: 14, height: 14, color: 'var(--muted)',
            }}
          >
            <circle cx="7" cy="7" r="4.5" />
            <line x1="10.5" y1="10.5" x2="14" y2="14" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию или описанию программы"
            style={{
              width: '100%',
              padding: '9px 12px 9px 32px',
              border: '1px solid var(--bor2)',
              borderRadius: 10,
              fontSize: 13, fontFamily: 'inherit', outline: 'none',
              background: 'var(--surf)', color: 'var(--text)',
            }}
          />
        </div>
        {levels.length > 0 && (
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            style={{
              padding: '9px 12px',
              border: '1px solid var(--bor2)',
              borderRadius: 10,
              fontSize: 13, fontFamily: 'inherit', outline: 'none',
              background: 'var(--surf)', color: 'var(--text)',
            }}
          >
            <option value="">Все уровни</option>
            {levels.map(l => (
              <option key={l as string} value={l as string}>{l as string}</option>
            ))}
          </select>
        )}
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
        {filtered.length === programs.length
          ? `${programs.length} программ`
          : `Показано ${filtered.length} из ${programs.length}`}
        {(search || levelFilter) && (
          <button
            type="button"
            onClick={() => { setSearch(''); setLevelFilter('') }}
            style={{
              background: 'none', border: 'none', marginLeft: 10,
              color: 'var(--purple)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', padding: 0, fontFamily: 'inherit',
            }}
          >
            Сбросить фильтры
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 32, color: 'var(--muted)', fontSize: 13 }}>
          Ничего не найдено. Попробуй изменить поиск или уровень.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map(p => (
            <ProgramRow
              key={p.id}
              program={p}
              schoolId={school.id}
              fallbackCurrency={currencyFromSchool}
              myClients={myClients}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProgramRow({
  program, schoolId, fallbackCurrency, myClients,
}: {
  program: any
  schoolId: number
  fallbackCurrency?: string
  myClients: any[]
}) {
  const attr = program.raw_data?.attributes || {}
  const levelText = attr.level_text
  const tuition = program.tuition
  const currency = attr.currency_of_fees?.code || attr.currency?.code || fallbackCurrency
  const appFee = program.application_fee ?? attr.application_fee
  const intake = attr.earliest_intake?.start_date
  const deadline = attr.earliest_intake?.submission_deadline
  const [showDesc, setShowDesc] = useState(false)
  const desc = attr.description ? attr.description.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : ''

  function fmt(v: any) {
    if (v == null || v === '') return '—'
    const n = Number(v)
    return Number.isFinite(n) ? Math.round(n).toLocaleString('ru') : String(v)
  }

  function fmtDate(s?: string) {
    if (!s) return '—'
    try {
      const d = new Date(s)
      return d.toLocaleDateString('ru', { month: 'short', year: 'numeric' })
    } catch { return s }
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Link
          href={`/curator/programs/${program.id}`}
          style={{
            flex: '1 1 260px', minWidth: 0,
            textDecoration: 'none', color: 'inherit',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>
            {program.name}
          </div>
          {levelText && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              {levelText}
            </div>
          )}
        </Link>
        <AddToShortlistButton
          schoolId={schoolId}
          programId={program.id}
          myClients={myClients}
        />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: 12, marginTop: 14,
      }}>
        <MetaCell k="Earliest intake" v={fmtDate(intake)} />
        <MetaCell k="Deadline" v={fmtDate(deadline)} />
        <MetaCell k="Стоимость" v={`${fmt(tuition)} ${currency || ''}`} />
        <MetaCell k="Взнос" v={appFee != null ? `${fmt(appFee)} ${currency || ''}` : '—'} />
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Link
          href={`/curator/programs/${program.id}`}
          style={{
            fontSize: 12, fontWeight: 600, color: 'var(--purple)',
            textDecoration: 'none',
          }}
        >
          Подробнее →
        </Link>
        {desc && (
          <>
            <span style={{ color: 'var(--bor2)' }}>•</span>
            <button
              type="button"
              onClick={() => setShowDesc(v => !v)}
              style={{
                background: 'none', border: 'none', padding: 0,
                color: 'var(--muted)', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {showDesc ? 'Скрыть превью' : 'Краткое описание'}
            </button>
          </>
        )}
      </div>
      {showDesc && desc && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
          {desc.slice(0, 600)}{desc.length > 600 ? '…' : ''}
        </div>
      )}
    </div>
  )
}

function MetaCell({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div style={{
        fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase',
        letterSpacing: '0.05em', fontWeight: 600, marginBottom: 3,
      }}>
        {k}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{v}</div>
    </div>
  )
}
