import { Geist, Oswald } from 'next/font/google'
import './ds.css'

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

export default function CuratorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`${geist.variable} ${oswald.variable} ds-scope`}>
      {children}
    </div>
  )
}
