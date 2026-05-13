import type { ReactNode } from 'react'
import { DemoProvider } from './DemoState'
import '../curator/ds.css'

export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-bg)' }}>
      <DemoProvider>{children}</DemoProvider>
    </div>
  )
}
