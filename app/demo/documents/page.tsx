'use client'

import Link from 'next/link'
import { DemoTopNav } from '../DemoTopNav'
import { DemoDocumentsSection } from '../components/DemoDocumentsSection'
import { useDemoState } from '../DemoState'
import { DEMO_REQUIRED_DOCS } from '../data'

export default function DemoDocumentsPage() {
  const { state, ready } = useDemoState()
  if (!ready) return null

  const docs = DEMO_REQUIRED_DOCS.map(d => {
    if (d.key === 'resume') {
      if (state.resumeStatus === 'ready') {
        return { ...d, status: 'uploaded' as const, hint: 'Готово, куратор утвердил.', href: '/demo/resume', fileName: 'Резюме — финал', fileSize: '24 КБ' }
      }
      if (state.resumeStatus === 'sent' || state.resumeStatus === 'editing') {
        return { ...d, status: 'pending' as const, href: '/demo/resume', hint: 'Отправлено куратору' }
      }
      return { ...d, status: 'locked' as const, lockedHint: 'Создаётся через блок «Резюме» выше.' }
    }
    if (d.key === 'motivation') {
      if (state.motivationStatus === 'ready') {
        return { ...d, status: 'uploaded' as const, hint: 'Готово.', href: '/demo/motivation', fileName: 'Мотивационное письмо — финал', fileSize: '24 КБ' }
      }
      if (state.motivationStatus === 'sent' || state.motivationStatus === 'editing') {
        return { ...d, status: 'pending' as const, href: '/demo/motivation', hint: 'Отправлено куратору' }
      }
      return { ...d, status: 'locked' as const, lockedHint: 'Создаётся через блок «Мотивационное письмо» выше.' }
    }
    return d
  })

  return (
    <>
      <DemoTopNav activePage="documents" />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 32px 80px' }}>
        <Link href="/demo" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'var(--ds-ink-dim)', textDecoration: 'none', marginBottom: 24,
        }}>
          ← Назад на главную
        </Link>
        <DemoDocumentsSection required={docs} />
      </main>
    </>
  )
}
