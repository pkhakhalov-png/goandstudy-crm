'use client'

import { useState, useEffect, useRef } from 'react'

export function SchoolHeroPhoto({ src, name }: { src: string; name: string }) {
  const ref = useRef<HTMLImageElement>(null)
  const [state, setState] = useState<'loading' | 'loaded' | 'broken'>('loading')

  // Если картинка уже в кеше браузера — onLoad не сработает после маунта,
  // поэтому проверяем complete/naturalWidth вручную.
  useEffect(() => {
    const img = ref.current
    if (!img) return
    if (img.complete) {
      setState(img.naturalWidth > 0 ? 'loaded' : 'broken')
    }
  }, [src])

  if (state === 'broken') return null

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt=""
      title={name}
      onLoad={() => setState('loaded')}
      onError={() => setState('broken')}
      style={{
        width: '100%',
        height: 320,
        objectFit: 'cover',
        borderRadius: 14,
        border: '1px solid var(--bor)',
        marginBottom: 16,
        display: 'block',
        background: 'var(--surf)',
        opacity: state === 'loaded' ? 1 : 0,
        transition: 'opacity 0.2s',
      }}
    />
  )
}
