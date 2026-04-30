'use client'

import { useState } from 'react'

export function SchoolHeroPhoto({ src, name }: { src: string; name: string }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'broken'>('loading')

  if (state === 'broken') return null

  return (
    <div style={{
      width: '100%',
      height: state === 'loaded' ? 320 : 0,
      borderRadius: 14,
      border: state === 'loaded' ? '1px solid var(--bor)' : 'none',
      marginBottom: state === 'loaded' ? 16 : 0,
      overflow: 'hidden',
      transition: 'height 0.2s ease, margin-bottom 0.2s ease',
      background: 'var(--surf)',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        title={name}
        loading="lazy"
        onLoad={() => setState('loaded')}
        onError={() => setState('broken')}
        style={{
          width: '100%',
          height: 320,
          objectFit: 'cover',
          display: 'block',
          opacity: state === 'loaded' ? 1 : 0,
          transition: 'opacity 0.2s',
        }}
      />
    </div>
  )
}
