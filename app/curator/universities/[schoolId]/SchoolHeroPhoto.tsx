'use client'

import { useState } from 'react'

export function SchoolHeroPhoto({ src, name }: { src: string; name: string }) {
  const [broken, setBroken] = useState(false)
  if (broken) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      onError={() => setBroken(true)}
      style={{
        width: '100%',
        height: 320,
        objectFit: 'cover',
        borderRadius: 14,
        border: '1px solid var(--bor)',
        marginBottom: 16,
        display: 'block',
        background: 'var(--surf)',
      }}
    />
  )
}
