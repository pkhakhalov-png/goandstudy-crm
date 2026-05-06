'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface Props {
  fallbackHref: string
  label: string
}

export function BackButton({ fallbackHref, label }: Props) {
  const router = useRouter()
  const [referrer, setReferrer] = useState<string | null>(null)

  // На монтировании запоминаем document.referrer (источник навигации).
  // Это позволяет «Назад» вернуться на ту же отфильтрованную страницу
  // даже если history по какой-то причине очистился (refresh, прямая ссылка).
  useEffect(() => {
    if (typeof document === 'undefined') return
    const ref = document.referrer
    if (!ref) return
    try {
      const u = new URL(ref)
      if (u.origin === window.location.origin) setReferrer(ref)
    } catch {}
  }, [])

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    // 1) Если есть referrer с того же домена — идём туда напрямую,
    //    сохраняя query-string (фильтры каталога).
    if (referrer) {
      window.location.href = referrer
      return
    }
    // 2) Иначе обычный back, иначе fallback.
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
