'use client'

import Link from 'next/link'
import { AddToShortlistButton } from './[schoolId]/AddToShortlistButton'

const COUNTRY_LABEL: Record<string, string> = {
  ca: 'Канада', au: 'Австралия', gb: 'Великобритания', de: 'Германия',
  us: 'США', ie: 'Ирландия', pt: 'Португалия', si: 'Словения', tr: 'Турция',
  it: 'Италия', se: 'Швеция', fi: 'Финляндия',
}

interface Props {
  program: any
  myClients: { id: number; name: string; country?: string | null }[]
}

export function ProgramCardInteractive({ program, myClients }: Props) {
  const school = program.school || {}
  const attr = program.raw_data?.attributes || {}
  const isCurator = program.source === 'curator_gh'

  // Куратор-поля имеют приоритет когда программа из BD
  const rawLevel = program.degree_text || attr.level_text || program.program_level_text || null
  // Сокращаем длинные multi-степени для бейджа: "Bachelor/Master/PhD" → "BACHELOR/MASTER" (2 макс)
  const levelText = rawLevel
    ? rawLevel.split(/[\/,]/).map((s: string) => s.trim()).filter(Boolean).slice(0, 2).join(' / ')
    : null
  const tuition = program.tuition
  const tuitionText = program.tuition_text
  const currency =
    attr.currency_of_fees?.code
    || attr.currency?.code
    || program.currency
    || null
  const appFee = program.application_fee ?? attr.application_fee
  const intakeText = program.start_date_text || program.deadline_text
  const intake = !intakeText ? (attr.earliest_intake?.start_date || program.earliest_intake_date) : null

  const flags: string[] = []
  if (attr.pgwp_participating || attr.pgwp_visible) flags.push('PGWP')
  if (attr.coop_length > 0) flags.push('Co-op')
  if (attr.bypass_eligibility) flags.push('Conditional')
  if (attr.delivery_method === 'online') flags.push('Онлайн')
  else if (attr.delivery_method === 'in_class') flags.push('Кампус')
  // Для BD-программ — short язык + тип вуза
  if (isCurator && program.language_text) {
    const shortLang = String(program.language_text).split(/[\/,]/).map((s: string) => s.trim()).filter(Boolean)[0] || null
    if (shortLang) flags.push(shortLang)
  }
  if (isCurator && school.university_type) flags.push(school.university_type)
  if (school.qs_rank && school.qs_rank < 999) flags.push(`QS #${school.qs_rank}`)

  const countryLabel = COUNTRY_LABEL[(school.country_code || '').toLowerCase()]
    || (school.country_code || '').toUpperCase()

  function fmt(v: any) {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? Math.round(n).toLocaleString('ru') : String(v)
  }

  function fmtDate(s?: string) {
    if (!s) return null
    try {
      const d = new Date(s)
      return d.toLocaleDateString('ru', { month: 'short', year: 'numeric' })
    } catch { return s }
  }

  return (
    <div className="ds-card" style={{
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      minHeight: 300,
    }}>
      {/* School header */}
      <Link
        href={`/curator/universities/${school.id}`}
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          textDecoration: 'none',
          color: 'inherit',
          paddingBottom: 12,
          borderBottom: '1px solid var(--ds-border-soft)',
        }}
      >
        {school.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={school.logo_url}
            alt={school.name}
            style={{
              width: 36, height: 36, borderRadius: 8,
              objectFit: 'contain', background: '#fff',
              border: '1px solid var(--ds-border-soft)', flexShrink: 0,
            }}
          />
        ) : (
          <div style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: 'var(--ds-purple-soft)',
            color: 'var(--ds-purple-deep)',
            display: 'grid', placeItems: 'center',
            fontFamily: 'var(--ds-font-display-stack)',
            fontSize: 14, fontWeight: 900,
          }}>
            {(school.name || '?').trim()[0]?.toUpperCase() || '?'}
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: 'var(--ds-ink)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            letterSpacing: '-0.01em',
          }}>
            {school.name}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--ds-muted)', marginTop: 2,
            textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500,
          }}>
            {countryLabel}{school.city ? ` · ${school.city}` : ''}
          </div>
        </div>
      </Link>

      {/* Program level + name */}
      <Link
        href={`/curator/programs/${program.id}`}
        style={{ flex: 1, textDecoration: 'none', color: 'inherit' }}
      >
        {levelText && (
          <div style={{ marginBottom: 8 }}>
            <span className="ds-chip ds-chip-purple" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
              {levelText}
            </span>
          </div>
        )}
        <div style={{
          fontFamily: 'var(--ds-font)',
          fontSize: 16, fontWeight: 700, color: 'var(--ds-ink)',
          lineHeight: 1.3, letterSpacing: '-0.015em',
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {program.name}
        </div>
      </Link>

      {/* Metrics — tabular, no emoji noise */}
      <div style={{
        display: 'grid', gap: 6, fontSize: 12,
        paddingTop: 4,
      }}>
        {(tuitionText || tuition != null) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{ color: 'var(--ds-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10, fontWeight: 600 }}>
              Стоимость
            </span>
            <span className="ds-mono" style={{ color: 'var(--ds-ink)', fontWeight: 700, fontSize: 13, textAlign: 'right' }}>
              {tuitionText || `${fmt(tuition)}${currency ? ` ${currency}` : ''}`}
              {!tuitionText && <span style={{ color: 'var(--ds-muted)', fontWeight: 500 }}> /год</span>}
            </span>
          </div>
        )}
        {(intakeText || intake) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{ color: 'var(--ds-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10, fontWeight: 600 }}>
              {program.deadline_text ? 'Дедлайн' : 'Старт'}
            </span>
            <span className="ds-mono" style={{ color: 'var(--ds-ink)', fontWeight: 600, fontSize: 12, textAlign: 'right' }}>
              {intakeText || fmtDate(intake)}
            </span>
          </div>
        )}
        {appFee != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ color: 'var(--ds-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10, fontWeight: 600 }}>
              Взнос
            </span>
            <span className="ds-mono" style={{ color: 'var(--ds-ink)', fontWeight: 600, fontSize: 12 }}>
              {fmt(appFee)}{currency ? ` ${currency}` : ''}
            </span>
          </div>
        )}
      </div>

      {/* Flags */}
      {flags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {flags.map((label, i) => (
            <span
              key={i}
              className="ds-chip ds-chip-neutral"
              style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto', paddingTop: 8 }}>
        <AddToShortlistButton
          schoolId={school.id}
          programId={program.id}
          myClients={myClients}
        />
      </div>
    </div>
  )
}
