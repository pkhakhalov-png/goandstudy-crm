'use client'

import Link from 'next/link'
import { AddToShortlistButton } from './[schoolId]/AddToShortlistButton'

const COUNTRY_LABEL: Record<string, string> = {
  ca: 'Канада', au: 'Австралия', gb: 'Великобритания', de: 'Германия',
  us: 'США', ie: 'Ирландия',
}

interface Props {
  program: any
  myClients: { id: number; name: string; country?: string | null }[]
}

export function ProgramCardInteractive({ program, myClients }: Props) {
  const school = program.school || {}
  const attr = program.raw_data?.attributes || {}
  const levelText = attr.level_text || program.program_level_text || null
  const tuition = program.tuition
  const currency =
    attr.currency_of_fees?.code
    || attr.currency?.code
    || program.currency
    || null
  const appFee = program.application_fee ?? attr.application_fee
  const intake = attr.earliest_intake?.start_date || program.earliest_intake_date

  // Tags from raw_data flags
  const tags: { label: string; color: string }[] = []
  if (attr.pgwp_participating || attr.pgwp_visible) tags.push({ label: 'PGWP', color: 'var(--green)' })
  if (attr.coop_length > 0) tags.push({ label: 'Co-op', color: '#0088cc' })
  if (attr.bypass_eligibility) tags.push({ label: 'Conditional Offer', color: 'var(--gold)' })
  if (attr.delivery_method === 'in_class') tags.push({ label: 'В кампусе', color: 'var(--muted)' })
  else if (attr.delivery_method === 'online') tags.push({ label: 'Онлайн', color: 'var(--muted)' })

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
    <div style={{
      background: 'var(--surf)',
      border: '1px solid var(--bor)',
      borderRadius: 14,
      padding: 16,
      boxShadow: 'var(--sh)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      minHeight: 280,
    }}>
      {/* School header: logo + name (link to school detail) */}
      <Link
        href={`/curator/universities/${school.id}`}
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          textDecoration: 'none',
          color: 'inherit',
          paddingBottom: 10,
          borderBottom: '1px solid var(--bor)',
        }}
      >
        {school.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={school.logo_url}
            alt={school.name}
            style={{
              width: 32, height: 32, borderRadius: 8,
              objectFit: 'contain', background: '#fff',
              border: '1px solid var(--bor)', flexShrink: 0,
            }}
          />
        ) : (
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: 'var(--purple)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700,
          }}>
            {(school.name || '?').trim()[0]?.toUpperCase() || '?'}
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {school.name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
            {countryLabel}{school.city ? `, ${school.city}` : ''}
          </div>
        </div>
      </Link>

      {/* Program level + name (link to program detail) */}
      <Link
        href={`/curator/programs/${program.id}`}
        style={{ flex: 1, textDecoration: 'none', color: 'inherit' }}
      >
        {levelText && (
          <div style={{
            fontSize: 10, fontWeight: 700, color: 'var(--purple)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
            marginBottom: 4,
          }}>
            {levelText}
          </div>
        )}
        <div style={{
          fontSize: 14, fontWeight: 700, color: 'var(--text)',
          lineHeight: 1.35,
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {program.name}
        </div>
      </Link>

      {/* Metrics */}
      <div style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
        {tuition != null && (
          <div>💵 <span style={{ color: 'var(--text)', fontWeight: 600 }}>
            {fmt(tuition)}{currency ? ` ${currency}` : ''}
          </span> /год</div>
        )}
        {intake && (
          <div>📅 Старт: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmtDate(intake)}</span></div>
        )}
        {appFee != null && (
          <div>📝 Взнос: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmt(appFee)}{currency ? ` ${currency}` : ''}</span></div>
        )}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {tags.map((tag, i) => (
            <span
              key={i}
              style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: 20,
                fontSize: 9,
                fontWeight: 700,
                color: tag.color,
                background: `color-mix(in srgb, ${tag.color} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${tag.color} 25%, transparent)`,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
              }}
            >
              {tag.label}
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
