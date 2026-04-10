'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

export function WelcomeOverlay() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const isWelcome = searchParams.get('welcome') === '1'
  const [phase, setPhase] = useState<'dark' | 'revealing' | 'done'>(
    isWelcome ? 'dark' : 'done'
  )

  useEffect(() => {
    if (!isWelcome) return

    // Add entrance class to .app
    const app = document.querySelector('.app')
    if (app) app.classList.add('app-enter')

    // Start reveal after a brief dark hold
    const t1 = setTimeout(() => setPhase('revealing'), 150)

    // Clean up
    const t2 = setTimeout(() => {
      setPhase('done')
      router.replace(pathname, { scroll: false })
    }, 1400)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [isWelcome, router, pathname])

  if (phase === 'done') return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#1D1D1F',
        transition: 'opacity 0.8s cubic-bezier(0.22, 1, 0.36, 1)',
        opacity: phase === 'dark' ? 1 : 0,
        pointerEvents: phase === 'dark' ? 'all' : 'none',
      }}
    />
  )
}
