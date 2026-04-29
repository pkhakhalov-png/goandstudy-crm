'use client'

import { useState } from 'react'

export function SchoolHeaderLogo({ src, name }: { src: string | null; name: string }) {
  const [broken, setBroken] = useState(false)
  const initial = name?.[0]?.toUpperCase() || '?'

  if (!src || broken) {
    return (
      <div style={{
        width: 72, height: 72, borderRadius: 12, flexShrink: 0,
        background: 'var(--purple)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, fontWeight: 700,
      }}>
        {initial}
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      onError={() => setBroken(true)}
      style={{
        width: 72, height: 72, borderRadius: 12, objectFit: 'contain',
        background: '#fff', border: '1px solid var(--bor)', flexShrink: 0,
      }}
    />
  )
}
