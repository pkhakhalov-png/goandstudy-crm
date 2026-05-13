import { Geist, Oswald } from 'next/font/google'
import type { ReactNode } from 'react'
import { DemoProvider } from './DemoState'
import '../curator/ds.css'

const geist = Geist({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--ds-font-body',
  display: 'swap',
})

const oswald = Oswald({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700'],
  variable: '--ds-font-display',
  display: 'swap',
})

export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${geist.variable} ${oswald.variable} ds-scope`}>
      <DemoProvider>{children}</DemoProvider>
    </div>
  )
}
