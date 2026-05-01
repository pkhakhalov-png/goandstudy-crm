'use client'

import { useState } from 'react'

export function SchoolHeroPhoto({ src, name }: { src: string; name: string }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'broken'>('loading')

  if (state === 'broken') return null

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      title={name}
      onLoad={() => setState('loaded')}
      onError={() => setState('broken')}
      style={{
        width: '100%',
        height: state === 'loaded' ? 320 : 0,
        objectFit: 'cover',
        borderRadius: state === 'loaded' ? 14 : 0,
        border: state === 'loaded' ? '1px solid var(--bor)' : 'none',
        marginBottom: state === 'loaded' ? 16 : 0,
        display: 'block',
        background: 'var(--surf)',
        opacity: state === 'loaded' ? 1 : 0,
        transition: 'opacity 0.2s, height 0.2s, margin-bottom 0.2s',
      }}
    />
  )
}
