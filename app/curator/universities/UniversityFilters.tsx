'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  countryCodes: string[]
  countryLabels: Record<string, string>
  initialCountry: string
  initialSearch: string
}

export function UniversityFilters({ countryCodes, countryLabels, initialCountry, initialSearch }: Props) {
  const router = useRouter()
  const [country, setCountry] = useState(initialCountry)
  const [search, setSearch] = useState(initialSearch)
  const [pending, startTransition] = useTransition()

  function apply(next: { country?: string; search?: string }) {
    const c = next.country !== undefined ? next.country : country
    const s = next.search !== undefined ? next.search : search
    const qs = new URLSearchParams()
    if (c) qs.set('country', c)
    if (s) qs.set('search', s)
    const str = qs.toString()
    startTransition(() => {
      router.push(str ? `/curator/universities?${str}` : '/curator/universities')
    })
  }

  function reset() {
    setCountry('')
    setSearch('')
    startTransition(() => router.push('/curator/universities'))
  }

  const hasFilters = Boolean(country || search)

  return (
    <div style={{
      display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
      marginBottom: 4,
    }}>
      <form
        onSubmit={(e) => { e.preventDefault(); apply({ search }) }}
        style={{ flex: '1 1 240px', maxWidth: 360, position: 'relative' }}
      >
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
          placeholder="Поиск по названию или городу"
          style={{
            width: '100%',
            padding: '9px 12px 9px 32px',
            border: '1px solid var(--bor2)',
            borderRadius: 10,
            fontSize: 13,
            fontFamily: 'inherit',
            outline: 'none',
            background: 'var(--surf)',
            color: 'var(--text)',
          }}
        />
      </form>

      <select
        value={country}
        onChange={(e) => { const c = e.target.value; setCountry(c); apply({ country: c }) }}
        className="si"
        style={{ minWidth: 140, padding: '9px 12px', borderRadius: 10, fontSize: 13 }}
      >
        <option value="">Все страны</option>
        {countryCodes.map(code => (
          <option key={code} value={code}>
            {countryLabels[code] || code.toUpperCase()}
          </option>
        ))}
      </select>

      {hasFilters && (
        <button
          type="button"
          onClick={reset}
          className="btn-s"
          style={{ fontSize: 12 }}
        >
          Сбросить
        </button>
      )}

      {pending && (
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Загрузка…</span>
      )}
    </div>
  )
}
