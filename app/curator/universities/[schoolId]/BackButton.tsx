'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface Props {
  fallbackHref: string
  label: string
  /** Если true — клиент-режим: НЕ ходить через router.back / referrer
   *  (могут увести в curator URLs которые клиент не имеет права видеть).
   *  Всегда используем fallbackHref. */
  clientMode?: boolean
}

export function BackButton({ fallbackHref, label, clientMode = false }: Props) {
  const router = useRouter()
  const [referrer, setReferrer] = useState<string | null>(null)

  useEffect(() => {
    if (clientMode) return
    if (typeof document === 'undefined') return
    const ref = document.referrer
    if (!ref) return
    try {
      const u = new URL(ref)
      if (u.origin === window.location.origin) setReferrer(ref)
    } catch {}
  }, [clientMode])

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    // Клиент-режим: всегда возвращаем в /client/* — иначе попадёт в
    // curator-страницы где не залогинен / нет прав.
    if (clientMode) {
      window.location.href = fallbackHref
      return
    }
    if (referrer) {
      window.location.href = referrer
      return
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push(fallbackHref)
    }
  }

  return (
    <a
      href={fallbackHref}
      onClick={handleClick}
      style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 13, cursor: 'pointer' }}
    >
      {label}
    </a>
  )
}
