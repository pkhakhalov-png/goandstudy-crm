'use client'

import { useState } from 'react'

interface Props {
  logoUrl: string | null
  fallbackUrl?: string | null
  title: string
  size?: number
}

export function ScholarshipLogo({ logoUrl, fallbackUrl, title, size = 52 }: Props) {
  const [src, setSrc] = useState<string | null>(logoUrl || fallbackUrl || null)
  const [triedFallback, setTriedFallback] = useState(false)

  function handleError() {
    if (!triedFallback && fallbackUrl && src !== fallbackUrl) {
      setSrc(fallbackUrl)
      setTriedFallback(true)
    } else {
      setSrc(null)
    }
  }

  if (!src) {
    return (
      <div
        style={{
          width: size,
          height: size,
          background: 'var(--purple)',
          color: '#fff',
          borderRadius: 10,
          display: 'grid',
          placeItems: 'center',
          fontSize: Math.round(size * 0.4),
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {title[0]?.toUpperCase() || '?'}
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={title}
      onError={handleError}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        background: '#fff',
        border: '1px solid var(--bor)',
        borderRadius: 10,
        flexShrink: 0,
      }}
    />
  )
}
