'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  countryCodes: string[]
  countryLabels: Record<string, string>
  schools: { id: number; name: string; country_code?: string | null }[]
  initial: {
    q: string
    country: string
    school: string
    levels: string[]
    intakeYears: string[]
    sort: string
  }
}

const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: 'name_asc', label: 'По алфавиту' },
  { key: 'price_asc', label: 'Сначала дешевле' },
  { key: 'price_desc', label: 'Сначала дороже' },
  { key: 'recent', label: 'Недавно обновлено' },
]

// Значения совпадают с raw_data.attributes.level
const LEVEL_OPTIONS: { value: string; label: string; group: string }[] = [
  { value: 'english', label: 'ESL / English', group: 'Языковые' },
  { value: 'certificate', label: '1-Year Post-Secondary Certificate', group: 'Undergraduate' },
  { value: 'diploma', label: '2-Year Undergraduate Diploma', group: 'Undergraduate' },
  { value: 'advanced_diploma', label: '3-Year Advanced Diploma', group: 'Undergraduate' },
  { value: '3_year_bachelors', label: "3-Year Bachelor's Degree", group: 'Undergraduate' },
  { value: 'bachelors', label: "4-Year Bachelor's Degree", group: 'Undergraduate' },
  { value: 'integrated_masters', label: 'Integrated Masters', group: 'Undergraduate' },
  { value: 'post_graduate_certificate', label: 'Postgraduate Certificate', group: 'Post-graduate' },
  { value: 'post_graduate_diploma', label: 'Postgraduate Diploma', group: 'Post-graduate' },
  { value: 'masters_degree', label: "Master's Degree", group: 'Post-graduate' },
  { value: 'doctoral_phd', label: 'Doctoral / PhD', group: 'Post-graduate' },
  { value: 'non_credential', label: 'Non-Credential', group: 'Прочее' },
]

const INTAKE_YEARS = ['2026', '2027', '2028']

export function UniversityFilters({ countryCodes, countryLabels, schools, initial }: Props) {
  const router = useRouter()
  const [q, setQ] = useState(initial.q)
  const [country, setCountry] = useState(initial.country)
  const [school, setSchool] = useState(initial.school)
  const [levels, setLevels] = useState<string[]>(initial.levels)
  const [intakeYears, setIntakeYears] = useState<string[]>(initial.intakeYears)
  const [sort, setSort] = useState(initial.sort || 'name_asc')
  const [pending, startTransition] = useTransition()

  function push(next: Partial<{ q: string; country: string; school: string; levels: string[]; intakeYears: string[]; sort: string }>) {
    const merged = {
      q: next.q !== undefined ? next.q : q,
      country: next.country !== undefined ? next.country : country,
      school: next.school !== undefined ? next.school : school,
      levels: next.levels !== undefined ? next.levels : levels,
      intakeYears: next.intakeYears !== undefined ? next.intakeYears : intakeYears,
      sort: next.sort !== undefined ? next.sort : sort,
    }
    const qs = new URLSearchParams()
    if (merged.q) qs.set('q', merged.q)
    if (merged.country) qs.set('country', merged.country)
    if (merged.school) qs.set('school', merged.school)
    if (merged.levels.length > 0) qs.set('levels', merged.levels.join(','))
    if (merged.intakeYears.length > 0) qs.set('intakes', merged.intakeYears.join(','))
    if (merged.sort && merged.sort !== 'name_asc') qs.set('sort', merged.sort)
    const str = qs.toString()
    startTransition(() => {
      router.push(str ? `/curator/universities?${str}` : '/curator/universities')
    })
  }

  function reset() {
    setQ(''); setCountry(''); setSchool(''); setLevels([]); setIntakeYears([]); setSort('name_asc')
    startTransition(() => router.push('/curator/universities'))
  }

  const filteredSchools = country
    ? schools.filter(s => (s.country_code || '').toLowerCase() === country)
    : schools

  const hasFilters = Boolean(q || country || school || levels.length > 0 || intakeYears.length > 0 || sort !== 'name_asc')

  const inputStyle: React.CSSProperties = {
    padding: '9px 12px',
    border: '1px solid var(--bor2)',
    borderRadius: 10,
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    background: 'var(--surf)',
    color: 'var(--text)',
    minWidth: 0,
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <style>{`
        @media (max-width: 960px) {
          .filters-row1, .filters-row2 { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Row 1 — search + country + institution */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(260px, 1.6fr) minmax(160px, 0.8fr) minmax(200px, 1fr)',
        gap: 10,
      }} className="filters-row1">
        <form onSubmit={(e) => { e.preventDefault(); push({ q }) }} style={{ position: 'relative' }}>
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
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Что изучать? Например, computer science"
            style={{ ...inputStyle, width: '100%', paddingLeft: 32 }}
          />
        </form>

        <select
          value={country}
          onChange={(e) => {
            const c = e.target.value
            setCountry(c); setSchool('')
            push({ country: c, school: '' })
          }}
          style={inputStyle}
        >
          <option value="">Все страны</option>
          {countryCodes.map(code => (
            <option key={code} value={code}>
              {countryLabels[code] || code.toUpperCase()}
            </option>
          ))}
        </select>

        <select
          value={school}
          onChange={(e) => { setSchool(e.target.value); push({ school: e.target.value }) }}
          style={inputStyle}
        >
          <option value="">Все вузы</option>
          {filteredSchools.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Row 2 — multi-selects + sort */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(180px, 1fr) minmax(140px, 0.6fr) minmax(160px, 0.8fr) auto',
        gap: 10,
        alignItems: 'center',
      }} className="filters-row2">
        <CheckboxDropdown
          label="Уровень программы"
          options={LEVEL_OPTIONS.map(o => ({ value: o.value, label: o.label, group: o.group }))}
          selected={levels}
          onChange={(next) => { setLevels(next); push({ levels: next }) }}
        />

        <CheckboxDropdown
          label="Intake"
          options={INTAKE_YEARS.map(y => ({ value: y, label: y }))}
          selected={intakeYears}
          onChange={(next) => { setIntakeYears(next); push({ intakeYears: next }) }}
        />

        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value); push({ sort: e.target.value }) }}
          style={inputStyle}
        >
          {SORT_OPTIONS.map(opt => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {hasFilters && (
            <button type="button" onClick={reset} className="btn-s" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              Сбросить
            </button>
          )}
          {pending && <span style={{ fontSize: 11, color: 'var(--muted)' }}>…</span>}
        </div>
      </div>
    </div>
  )
}

/* ─── Checkbox multi-select dropdown ─── */

function CheckboxDropdown({
  label, options, selected, onChange,
}: {
  label: string
  options: { value: string; label: string; group?: string }[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  function toggle(value: string) {
    if (selected.includes(value)) onChange(selected.filter(v => v !== value))
    else onChange([...selected, value])
  }

  const groups: Record<string, typeof options> = {}
  options.forEach(o => {
    const g = o.group || ''
    if (!groups[g]) groups[g] = []
    groups[g].push(o)
  })

  const active = selected.length > 0
  const buttonLabel = active
    ? `${label}: ${selected.length}`
    : label

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          padding: '9px 12px',
          border: `1px solid ${active ? 'var(--purple)' : 'var(--bor2)'}`,
          borderRadius: 10,
          background: active ? 'rgba(177,94,204,.08)' : 'var(--surf)',
          color: active ? 'var(--purple)' : 'var(--text)',
          fontSize: 13,
          fontWeight: active ? 600 : 400,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: 'inherit',
          textAlign: 'left',
          gap: 8,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {buttonLabel}
        </span>
        <span style={{
          opacity: 0.6, fontSize: 10,
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.15s',
        }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          minWidth: 260,
          maxHeight: 360,
          overflowY: 'auto',
          background: 'var(--surf)',
          border: '1px solid var(--bor2)',
          borderRadius: 10,
          boxShadow: '0 8px 28px rgba(0,0,0,.12)',
          zIndex: 30,
          padding: 8,
        }}>
          {Object.entries(groups).map(([group, items]) => (
            <div key={group} style={{ marginBottom: group ? 8 : 0 }}>
              {group && (
                <div style={{
                  fontSize: 10, fontWeight: 700, color: 'var(--muted)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  padding: '6px 8px 4px',
                }}>
                  {group}
                </div>
              )}
              {items.map(opt => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 8px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                    color: 'var(--text)',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--rh)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.value)}
                    onChange={() => toggle(opt.value)}
                    style={{ accentColor: 'var(--purple)', cursor: 'pointer' }}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          ))}
          {selected.length > 0 && (
            <div style={{ borderTop: '1px solid var(--bor)', marginTop: 6, paddingTop: 6 }}>
              <button
                type="button"
                onClick={() => onChange([])}
                style={{
                  width: '100%', textAlign: 'center', padding: 6,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--muted)', fontSize: 12, fontFamily: 'inherit',
                }}
              >
                Очистить ({selected.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
