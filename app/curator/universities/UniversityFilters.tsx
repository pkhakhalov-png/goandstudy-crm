'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  countryCodes: string[]
  countryLabels: Record<string, string>
  schools: { id: number; name: string; country_code?: string | null }[]
  initial: { q: string; country: string; school: string; sort: string }
}

const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: 'name_asc', label: 'По алфавиту' },
  { key: 'price_asc', label: 'Сначала дешевле' },
  { key: 'price_desc', label: 'Сначала дороже' },
  { key: 'recent', label: 'Недавно обновлено' },
]

export function UniversityFilters({ countryCodes, countryLabels, schools, initial }: Props) {
  const router = useRouter()
  const [q, setQ] = useState(initial.q)
  const [country, setCountry] = useState(initial.country)
  const [school, setSchool] = useState(initial.school)
  const [sort, setSort] = useState(initial.sort || 'name_asc')
  const [pending, startTransition] = useTransition()

  function apply(next: Partial<typeof initial>) {
    const merged = {
      q: next.q !== undefined ? next.q : q,
      country: next.country !== undefined ? next.country : country,
      school: next.school !== undefined ? next.school : school,
      sort: next.sort !== undefined ? next.sort : sort,
    }
    const qs = new URLSearchParams()
    if (merged.q) qs.set('q', merged.q)
    if (merged.country) qs.set('country', merged.country)
    if (merged.school) qs.set('school', merged.school)
    if (merged.sort && merged.sort !== 'name_asc') qs.set('sort', merged.sort)
    const str = qs.toString()
    startTransition(() => {
      router.push(str ? `/curator/universities?${str}` : '/curator/universities')
    })
  }

  function reset() {
    setQ(''); setCountry(''); setSchool(''); setSort('name_asc')
    startTransition(() => router.push('/curator/universities'))
  }

  const filteredSchools = country
    ? schools.filter(s => (s.country_code || '').toLowerCase() === country)
    : schools

  const hasFilters = Boolean(q || country || school || sort !== 'name_asc')

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
      {/* Row 1 — search + country + institution */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(240px, 1.6fr) minmax(140px, 0.8fr) minmax(160px, 1fr)',
        gap: 10,
      }} className="filters-row">
        <style>{`
          @media (max-width: 860px) {
            .filters-row { grid-template-columns: 1fr !important; }
            .filters-row2 { grid-template-columns: 1fr !important; }
          }
        `}</style>

        {/* Search */}
        <form onSubmit={(e) => { e.preventDefault(); apply({ q }) }} style={{ position: 'relative' }}>
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
            placeholder="Что изучать? (название программы)"
            style={{ ...inputStyle, width: '100%', paddingLeft: 32 }}
          />
        </form>

        {/* Country */}
        <select
          value={country}
          onChange={(e) => {
            const c = e.target.value
            setCountry(c)
            // при смене страны — сбрасываем выбранный вуз
            setSchool('')
            apply({ country: c, school: '' })
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

        {/* Institution */}
        <select
          value={school}
          onChange={(e) => { setSchool(e.target.value); apply({ school: e.target.value }) }}
          style={inputStyle}
        >
          <option value="">Все вузы</option>
          {filteredSchools.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Row 2 — sort + reset + spinner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
      }} className="filters-row2">
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value); apply({ sort: e.target.value }) }}
          style={{ ...inputStyle, minWidth: 180 }}
        >
          {SORT_OPTIONS.map(opt => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>

        {hasFilters && (
          <button type="button" onClick={reset} className="btn-s" style={{ fontSize: 12 }}>
            Сбросить
          </button>
        )}

        {pending && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Загрузка…</span>
        )}
      </div>
    </div>
  )
}
