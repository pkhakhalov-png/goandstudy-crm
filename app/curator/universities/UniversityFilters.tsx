'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  countryCodes: string[]
  countryLabels: Record<string, string>
  countryCounts?: Record<string, number>
  schools: { id: number; name: string; country_code?: string | null }[]
  specialtyOptions?: string[]
  initial: {
    q: string
    country: string
    school: string
    levels: string[]
    intakeYears: string[]
    sort: string
    specialty?: string
    uniType?: string
    budget?: string
    langOnly?: boolean
  }
  /** Base path to navigate on filter change. Extra params passed through. */
  basePath?: string
  /** Extra URL params to preserve on every navigation (e.g., `tab=shortlist`) */
  stickyParams?: Record<string, string>
}

const COUNTRY_FLAGS: Record<string, string> = {
  us: '🇺🇸', gb: '🇬🇧', ca: '🇨🇦', au: '🇦🇺', de: '🇩🇪',
  fr: '🇫🇷', it: '🇮🇹', es: '🇪🇸', nl: '🇳🇱', at: '🇦🇹',
  ie: '🇮🇪', ae: '🇦🇪', hu: '🇭🇺',
  pt: '🇵🇹', si: '🇸🇮', tr: '🇹🇷',
}

const BUDGET_OPTIONS = [
  { value: '', label: 'Любой бюджет' },
  { value: 'free', label: 'Бесплатно (до $1k)' },
  { value: 'low', label: 'до $10k' },
  { value: 'mid1', label: '$10k–$25k' },
  { value: 'mid2', label: '$25k–$50k' },
  { value: 'high', label: 'от $50k' },
]

const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: 'name_asc', label: 'По алфавиту' },
  { key: 'price_asc', label: 'Сначала дешевле' },
  { key: 'price_desc', label: 'Сначала дороже' },
  { key: 'recent', label: 'Недавно обновлено' },
]

// 3 укрупнённые группы — работают через mapping на сервере.
// Раньше были 12 вариантов из applyboard, но они пустые для daad/curator_gh
// → фильтр давал 0 результатов по DE/AE. Теперь группа = OR по нескольким
// raw-уровням + name-heuristic для источников без структурного level.
const LEVEL_OPTIONS: { value: string; label: string; group?: string }[] = [
  { value: 'bachelor', label: 'Бакалавриат' },
  { value: 'master',   label: 'Магистратура' },
  { value: 'phd',      label: 'PhD / Доктор' },
  { value: 'language', label: 'Языковые' },
]

const INTAKE_YEARS = ['2026', '2027', '2028']

export function UniversityFilters({ countryCodes, countryLabels, countryCounts, schools, specialtyOptions, initial, basePath = '/curator/universities', stickyParams }: Props) {
  const router = useRouter()
  const [q, setQ] = useState(initial.q)
  const [country, setCountry] = useState(initial.country)
  const [school, setSchool] = useState(initial.school)
  const [levels, setLevels] = useState<string[]>(initial.levels)
  const [intakeYears, setIntakeYears] = useState<string[]>(initial.intakeYears)
  const [sort, setSort] = useState(initial.sort || 'name_asc')
  const [specialty, setSpecialty] = useState(initial.specialty || '')
  const [uniType, setUniType] = useState(initial.uniType || '')
  const [budget, setBudget] = useState(initial.budget || '')
  const [langOnly, setLangOnly] = useState(!!initial.langOnly)
  const [pending, startTransition] = useTransition()

  function push(next: Partial<{ q: string; country: string; school: string; levels: string[]; intakeYears: string[]; sort: string; specialty: string; uniType: string; budget: string; langOnly: boolean }>) {
    const merged = {
      q: next.q !== undefined ? next.q : q,
      country: next.country !== undefined ? next.country : country,
      school: next.school !== undefined ? next.school : school,
      levels: next.levels !== undefined ? next.levels : levels,
      intakeYears: next.intakeYears !== undefined ? next.intakeYears : intakeYears,
      sort: next.sort !== undefined ? next.sort : sort,
      specialty: next.specialty !== undefined ? next.specialty : specialty,
      uniType: next.uniType !== undefined ? next.uniType : uniType,
      budget: next.budget !== undefined ? next.budget : budget,
      langOnly: next.langOnly !== undefined ? next.langOnly : langOnly,
    }
    const qs = new URLSearchParams()
    if (stickyParams) for (const [k, v] of Object.entries(stickyParams)) qs.set(k, v)
    if (merged.q) qs.set('q', merged.q)
    if (merged.country) qs.set('country', merged.country)
    if (merged.school) qs.set('school', merged.school)
    if (merged.levels.length > 0) qs.set('levels', merged.levels.join(','))
    if (merged.intakeYears.length > 0) qs.set('intakes', merged.intakeYears.join(','))
    if (merged.sort && merged.sort !== 'name_asc') qs.set('sort', merged.sort)
    if (merged.specialty) qs.set('specialty', merged.specialty)
    if (merged.uniType) qs.set('uniType', merged.uniType)
    if (merged.budget) qs.set('budget', merged.budget)
    if (merged.langOnly) qs.set('langOnly', '1')
    const str = qs.toString()
    startTransition(() => {
      router.push(str ? `${basePath}?${str}` : basePath, { scroll: false })
    })
  }

  function reset() {
    setQ(''); setCountry(''); setSchool(''); setLevels([]); setIntakeYears([]); setSort('name_asc')
    setSpecialty(''); setUniType(''); setBudget(''); setLangOnly(false)
    const qs = new URLSearchParams()
    if (stickyParams) for (const [k, v] of Object.entries(stickyParams)) qs.set(k, v)
    const str = qs.toString()
    startTransition(() => router.push(str ? `${basePath}?${str}` : basePath, { scroll: false }))
  }

  const filteredSchools = country
    ? schools.filter(s => (s.country_code || '').toLowerCase() === country)
    : schools

  const hasFilters = Boolean(q || country || school || levels.length > 0 || intakeYears.length > 0 || sort !== 'name_asc' || specialty || uniType || budget || langOnly)

  const inputStyle: React.CSSProperties = {
    padding: '10px 14px',
    border: '1px solid var(--ds-border)',
    borderRadius: 12,
    fontSize: 14,
    fontFamily: 'inherit',
    outline: 'none',
    background: 'var(--ds-bg)',
    color: 'var(--ds-ink)',
    minWidth: 0,
    letterSpacing: '-0.005em',
    transition: 'border-color 120ms, box-shadow 120ms',
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <style>{`
        @media (max-width: 960px) {
          .filters-row1, .filters-row2, .filters-row3 { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Языковые курсы тоггл — отдельный режим выдачи */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => { setLangOnly(!langOnly); push({ langOnly: !langOnly }) }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px',
            border: `1px solid ${langOnly ? 'var(--ds-purple)' : 'var(--ds-border)'}`,
            background: langOnly ? 'var(--ds-purple-soft)' : 'var(--ds-bg)',
            color: langOnly ? 'var(--ds-purple-deep)' : 'var(--ds-muted)',
            borderRadius: 100,
            fontSize: 12, fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            transition: 'all 120ms',
          }}
        >
          🗣 {langOnly ? 'Только языковые курсы' : 'Все программы'}
        </button>
        {langOnly && (
          <span style={{ fontSize: 11, color: 'var(--ds-muted)' }}>
            Показываются только программы английского / Sprachschule / ESL
          </span>
        )}
      </div>

      {/* Country tabs */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: '1px solid var(--ds-border-soft)', paddingBottom: 2 }}>
        <button
          type="button"
          onClick={() => { setCountry(''); setSchool(''); push({ country: '', school: '' }) }}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 14px',
            borderBottom: country === '' ? '2.5px solid var(--ds-purple)' : '2.5px solid transparent',
            marginBottom: -2,
            fontSize: 13, fontWeight: 700,
            color: country === '' ? 'var(--ds-purple)' : 'var(--ds-muted)',
            whiteSpace: 'nowrap',
            fontFamily: 'inherit',
          }}
        >
          🌍 Все
        </button>
        {countryCodes.map(code => {
          const active = country === code
          const cnt = countryCounts?.[code]
          return (
            <button
              key={code}
              type="button"
              onClick={() => { setCountry(code); setSchool(''); push({ country: code, school: '' }) }}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 14px',
                borderBottom: active ? '2.5px solid var(--ds-purple)' : '2.5px solid transparent',
                marginBottom: -2,
                fontSize: 13, fontWeight: 700,
                color: active ? 'var(--ds-purple)' : 'var(--ds-muted)',
                whiteSpace: 'nowrap',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 16 }}>{COUNTRY_FLAGS[code] || ''}</span>
              {countryLabels[code] || code.toUpperCase()}
              {cnt !== undefined && (
                <span style={{
                  background: active ? 'var(--ds-purple-soft)' : 'var(--ds-bg-alt)',
                  border: `1px solid ${active ? 'rgba(177,94,204,.3)' : 'var(--ds-border-soft)'}`,
                  borderRadius: 100,
                  fontSize: 9, fontWeight: 800,
                  padding: '1px 7px',
                  color: active ? 'var(--ds-purple)' : 'var(--ds-muted)',
                }}>{cnt}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Row 1 — search + school */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(260px, 1.6fr) minmax(200px, 1fr)',
        gap: 10,
      }} className="filters-row1">
        <form onSubmit={(e) => { e.preventDefault(); push({ q }) }} style={{ position: 'relative' }}>
          <svg
            viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
            style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              width: 15, height: 15, color: 'var(--ds-muted)',
              pointerEvents: 'none',
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
            style={{ ...inputStyle, width: '100%', paddingLeft: 36 }}
          />
        </form>

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

      {/* Row 2 — specialty / uniType / budget */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(180px, 1.2fr) minmax(140px, 0.8fr) minmax(140px, 0.8fr)',
        gap: 10,
      }} className="filters-row2">
        <select
          value={specialty}
          onChange={(e) => { setSpecialty(e.target.value); push({ specialty: e.target.value }) }}
          style={inputStyle}
        >
          <option value="">Все направления</option>
          {(specialtyOptions || []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={uniType}
          onChange={(e) => { setUniType(e.target.value); push({ uniType: e.target.value }) }}
          style={inputStyle}
        >
          <option value="">Все типы вузов</option>
          <option value="Государственный">Государственный</option>
          <option value="Частный">Частный</option>
        </select>

        <select
          value={budget}
          onChange={(e) => { setBudget(e.target.value); push({ budget: e.target.value }) }}
          style={inputStyle}
        >
          {BUDGET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Row 3 — multi-selects + sort */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(180px, 1fr) minmax(140px, 0.6fr) minmax(160px, 0.8fr) auto',
        gap: 10,
        alignItems: 'center',
      }} className="filters-row3">
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
            <button
              type="button"
              onClick={reset}
              className="ds-btn ds-btn-secondary ds-btn-sm"
              style={{ whiteSpace: 'nowrap' }}
            >
              Сбросить
            </button>
          )}
          {pending && <span style={{ fontSize: 11, color: 'var(--ds-muted)' }}>…</span>}
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
          padding: '10px 14px',
          border: `1px solid ${active ? 'var(--ds-purple)' : 'var(--ds-border)'}`,
          borderRadius: 12,
          background: active ? 'var(--ds-purple-soft)' : 'var(--ds-bg)',
          color: active ? 'var(--ds-purple-deep)' : 'var(--ds-ink)',
          fontSize: 14,
          fontWeight: active ? 600 : 400,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: 'inherit',
          textAlign: 'left',
          gap: 8,
          letterSpacing: '-0.005em',
          transition: 'all 120ms',
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
          top: 'calc(100% + 6px)',
          left: 0,
          minWidth: 280,
          maxHeight: 380,
          overflowY: 'auto',
          background: 'var(--ds-bg)',
          border: '1px solid var(--ds-border)',
          borderRadius: 14,
          boxShadow: '0 12px 40px -12px rgba(29,29,31,0.18)',
          zIndex: 30,
          padding: 10,
        }}>
          {Object.entries(groups).map(([group, items]) => (
            <div key={group} style={{ marginBottom: group ? 10 : 0 }}>
              {group && (
                <div style={{
                  fontSize: 10, fontWeight: 700, color: 'var(--ds-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                  padding: '8px 8px 4px',
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
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    color: 'var(--ds-ink)',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--ds-bg-alt)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.value)}
                    onChange={() => toggle(opt.value)}
                    style={{ accentColor: 'var(--ds-purple)', cursor: 'pointer', width: 16, height: 16 }}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          ))}
          {selected.length > 0 && (
            <div style={{ borderTop: '1px solid var(--ds-border-soft)', marginTop: 8, paddingTop: 8 }}>
              <button
                type="button"
                onClick={() => onChange([])}
                style={{
                  width: '100%', textAlign: 'center', padding: 8,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--ds-purple)', fontSize: 12, fontFamily: 'inherit',
                  fontWeight: 600,
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
