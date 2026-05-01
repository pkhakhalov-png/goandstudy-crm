'use client'

import { useRouter } from 'next/navigation'

interface Props {
  fallbackHref: string
  label: string
}

export function BackButton({ fallbackHref, label }: Props) {
  const router = useRouter()

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    // history.length > 1 → есть куда вернуться (внутри SPA или из списка)
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
